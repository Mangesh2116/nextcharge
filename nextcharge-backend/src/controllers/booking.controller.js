const Booking = require('../models/Booking');
const Station = require('../models/Station');
const { AppError, asyncHandler, sendSuccess, sendPaginated } = require('../utils/errors');
const { sendEmail, sendBookingConfirmationSMS } = require('../services/notification.service');
const { deleteCache } = require('../config/redis');

// ─── Create Booking ───────────────────────────────────────────────────────────
exports.createBooking = asyncHandler(async (req, res) => {
  const { stationId, connectorId, vehicleId, scheduledStart, durationMinutes } = req.body;

  // Validate station & connector
  const station = await Station.findById(stationId);
  if (!station || station.status !== 'active') throw new AppError('Station not available.', 400);

  const connector = station.connectors.find(c => c.id === connectorId);
  if (!connector) throw new AppError('Connector not found on this station.', 404);
  if (connector.status === 'faulted' || connector.status === 'offline') {
    throw new AppError(`Connector is ${connector.status}.`, 400);
  }

  const start = new Date(scheduledStart);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  // Must be in the future
  if (start <= new Date()) throw new AppError('Booking time must be in the future.', 400);

  // Max advance booking: 7 days
  const maxAdvance = new Date();
  maxAdvance.setDate(maxAdvance.getDate() + 7);
  if (start > maxAdvance) throw new AppError('Bookings can be made up to 7 days in advance.', 400);

  // Conflict check: no overlapping confirmed/in_progress booking for same connector
  const conflict = await Booking.findOne({
    station: stationId,
    connectorId,
    status: { $in: ['confirmed', 'in_progress', 'pending'] },
    $or: [
      { scheduledStart: { $lt: end }, scheduledEnd: { $gt: start } }
    ]
  });
  if (conflict) throw new AppError('This connector is already booked for the selected time.', 409);

  // Get vehicle details
  const user = req.user;
  const vehicle = vehicleId ? user.vehicles?.find(v => v._id.toString() === vehicleId) : user.vehicles?.find(v => v.isPrimary);

  // Estimate cost
  const estimatedKwh = (connector.powerKw * durationMinutes) / 60;
  const estimatedAmount = estimatedKwh * connector.pricePerKwh + connector.sessionStartFee;
  const tax = estimatedAmount * 0.18; // 18% GST

  const booking = await Booking.create({
    user: user._id,
    station: stationId,
    connectorId,
    vehicle: vehicle ? {
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate,
      connectorType: vehicle.connectorType
    } : undefined,
    scheduledStart: start,
    scheduledEnd: end,
    durationMinutes,
    pricing: {
      pricePerKwh: connector.pricePerKwh,
      sessionStartFee: connector.sessionStartFee,
      estimatedKwh: Math.round(estimatedKwh * 100) / 100,
      estimatedAmount: Math.round(estimatedAmount * 100) / 100,
      tax: Math.round(tax * 100) / 100
    }
  });

  await booking.populate('station', 'name address');

  sendSuccess(res, { booking }, 'Booking created. Complete payment to confirm.', 201);
});

// ─── Get user's bookings ──────────────────────────────────────────────────────
exports.getMyBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const query = { user: req.user._id };
  if (status) query.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate('station', 'name address coverPhoto')
      .sort({ scheduledStart: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit)),
    Booking.countDocuments(query)
  ]);

  sendPaginated(res, bookings, total, page, limit, 'Bookings fetched');
});

// ─── Get single booking ───────────────────────────────────────────────────────
exports.getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('station', 'name address location connectors amenities')
    .populate('user', 'name phone email');

  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AppError('Access denied.', 403);
  }

  sendSuccess(res, { booking }, 'Booking fetched');
});

// ─── Cancel Booking ───────────────────────────────────────────────────────────
exports.cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('station', 'name');
  if (!booking) throw new AppError('Booking not found.', 404);

  if (booking.user.toString() !== req.user._id.toString()) {
    throw new AppError('Access denied.', 403);
  }

  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw new AppError(`Cannot cancel a booking with status: ${booking.status}`, 400);
  }

  const minutesUntilStart = (booking.scheduledStart - new Date()) / 60000;
  const isRefundEligible = minutesUntilStart > 30 && booking.payment.status === 'paid';
  const refundAmount = isRefundEligible ? booking.pricing.finalAmount : 0;

  booking.status = 'cancelled';
  booking.cancellation = {
    cancelledAt: new Date(),
    cancelledBy: 'user',
    reason: req.body.reason || 'Cancelled by user',
    isRefundEligible,
    refundAmount
  };
  await booking.save();

  // Notify
  const user = req.user;
  await sendEmail(user.email, 'bookingCancelled', booking);

  // Emit real-time update
  const io = req.app.get('io');
  if (io) io.to(`station:${booking.station._id}`).emit('booking:cancelled', { bookingId: booking._id, connectorId: booking.connectorId });

  sendSuccess(res, { booking, refundAmount }, isRefundEligible
    ? `Booking cancelled. Refund of ₹${refundAmount} will be processed in 5–7 business days.`
    : 'Booking cancelled. No refund eligible (cancelled within 30 minutes of start time).'
  );
});

// ─── Check-in (scan QR) ───────────────────────────────────────────────────────
exports.checkIn = asyncHandler(async (req, res) => {
  const { qrToken } = req.body;
  const booking = await Booking.findOne({ qrToken }).populate('station');
  if (!booking) throw new AppError('Invalid QR code.', 400);

  if (booking.status !== 'confirmed') throw new AppError(`Cannot check in. Booking status: ${booking.status}`, 400);

  const now = new Date();
  const minutesUntilStart = (booking.scheduledStart - now) / 60000;
  if (minutesUntilStart > 15) throw new AppError('Too early to check in. Please arrive within 15 minutes of your slot.', 400);
  if (now > booking.scheduledEnd) throw new AppError('Your booking slot has expired.', 400);

  booking.status = 'in_progress';
  booking.actualStart = now;
  booking.checkedInAt = now;
  await booking.save();

  // Update connector status
  await Station.updateOne(
    { _id: booking.station._id, 'connectors.id': booking.connectorId },
    { $set: { 'connectors.$.status': 'charging', 'connectors.$.currentSession.bookingId': booking._id } }
  );

  const io = req.app.get('io');
  if (io) io.to(`station:${booking.station._id}`).emit('connector:status', { connectorId: booking.connectorId, status: 'charging' });

  sendSuccess(res, { booking }, 'Check-in successful. Charging session started!');
});

// ─── Complete Session ─────────────────────────────────────────────────────────
exports.completeSession = asyncHandler(async (req, res) => {
  const { bookingId, actualKwh } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== 'in_progress') throw new AppError('No active session found.', 400);

  const now = new Date();
  const actualAmount = actualKwh * booking.pricing.pricePerKwh + booking.pricing.sessionStartFee;
  const tax = actualAmount * 0.18;

  booking.status = 'completed';
  booking.actualEnd = now;
  booking.actualDurationMinutes = Math.round((now - booking.actualStart) / 60000);
  booking.pricing.actualKwh = actualKwh;
  booking.pricing.actualAmount = Math.round(actualAmount * 100) / 100;
  booking.pricing.tax = Math.round(tax * 100) / 100;
  booking.pricing.finalAmount = Math.round((actualAmount + tax) * 100) / 100;
  await booking.save();

  // Update connector back to available
  await Station.updateOne(
    { _id: booking.station, 'connectors.id': booking.connectorId },
    { $set: { 'connectors.$.status': 'available', 'connectors.$.currentSession': {} } }
  );

  // Update user stats
  const { User } = require('../models/User');
  await User.findByIdAndUpdate(booking.user, {
    $inc: {
      totalSessionsCharged: 1,
      totalKwhCharged: actualKwh,
      totalSpent: booking.pricing.finalAmount,
      carbonSaved: actualKwh * 0.82  // avg India grid emission factor kg CO2/kWh saved vs ICE
    }
  });

  await deleteCache(`station:${booking.station}`);

  sendSuccess(res, { booking, finalAmount: booking.pricing.finalAmount }, 'Charging session completed!');
});
