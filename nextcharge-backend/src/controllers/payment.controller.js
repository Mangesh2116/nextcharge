const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { AppError, asyncHandler, sendSuccess } = require('../utils/errors');
const { sendEmail, sendBookingConfirmationSMS } = require('../services/notification.service');

let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
} catch (_) {
  console.warn('Razorpay not configured — payments in mock mode');
}

// ─── Create Razorpay Order ────────────────────────────────────────────────────
exports.createOrder = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;

  const booking = await Booking.findById(bookingId).populate('station', 'name address');
  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.user.toString() !== req.user._id.toString()) throw new AppError('Access denied.', 403);
  if (booking.payment.status === 'paid') throw new AppError('Booking already paid.', 400);

  const amount = Math.round((booking.pricing.estimatedAmount + (booking.pricing.tax || 0)) * 100); // paise

  let order;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: booking.bookingRef,
      notes: {
        bookingId: booking._id.toString(),
        userId: req.user._id.toString(),
        stationName: booking.station?.name
      }
    });
  } else {
    // Mock order for development
    order = {
      id: `order_mock_${Date.now()}`,
      amount,
      currency: 'INR',
      receipt: booking.bookingRef,
      status: 'created'
    };
  }

  // Store order ID on booking
  booking.payment.razorpayOrderId = order.id;
  await booking.save();

  sendSuccess(res, {
    orderId: order.id,
    amount,
    currency: 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
    bookingRef: booking.bookingRef,
    description: `NextCharge — ${booking.station?.name}`
  }, 'Order created');
});

// ─── Verify Payment ───────────────────────────────────────────────────────────
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const booking = await Booking.findById(bookingId).populate('station', 'name address');
  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.user.toString() !== req.user._id.toString()) throw new AppError('Access denied.', 403);

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'mock_secret')
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const isValid = process.env.NODE_ENV === 'development' || expectedSignature === razorpay_signature;
  if (!isValid) throw new AppError('Payment verification failed. Invalid signature.', 400);

  // Confirm booking
  booking.status = 'confirmed';
  booking.payment.status = 'paid';
  booking.payment.razorpayPaymentId = razorpay_payment_id;
  booking.payment.razorpaySignature = razorpay_signature;
  booking.payment.paidAt = new Date();
  booking.pricing.finalAmount = booking.pricing.estimatedAmount + (booking.pricing.tax || 0);
  await booking.save();

  const user = await User.findById(req.user._id);

  // Send notifications
  await Promise.allSettled([
    sendEmail(user.email, 'bookingConfirmed', booking),
    sendBookingConfirmationSMS(user.phone, booking)
  ]);

  // Emit real-time confirmation
  const io = req.app.get('io');
  if (io) {
    io.to(`station:${booking.station._id}`).emit('booking:confirmed', {
      connectorId: booking.connectorId,
      scheduledStart: booking.scheduledStart,
      scheduledEnd: booking.scheduledEnd
    });
  }

  sendSuccess(res, { booking }, 'Payment verified. Booking confirmed!');
});

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────
exports.webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);

  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex');

  if (signature !== expectedSig) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  const { event, payload } = req.body;

  if (event === 'payment.failed') {
    const orderId = payload.payment.entity.order_id;
    await Booking.findOneAndUpdate(
      { 'payment.razorpayOrderId': orderId },
      { 'payment.status': 'failed', status: 'cancelled' }
    );
  }

  if (event === 'refund.processed') {
    const paymentId = payload.refund.entity.payment_id;
    await Booking.findOneAndUpdate(
      { 'payment.razorpayPaymentId': paymentId },
      {
        'payment.status': 'refunded',
        'payment.refundId': payload.refund.entity.id,
        'payment.refundedAt': new Date()
      }
    );
  }

  res.json({ received: true });
});

// ─── Refund ───────────────────────────────────────────────────────────────────
exports.initiateRefund = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await Booking.findById(bookingId);

  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.payment.status !== 'paid') throw new AppError('No payment to refund.', 400);
  if (!booking.cancellation?.isRefundEligible) throw new AppError('This booking is not eligible for a refund.', 400);

  const refundAmount = Math.round((booking.cancellation.refundAmount || booking.pricing.finalAmount) * 100);

  let refund;
  if (razorpay && booking.payment.razorpayPaymentId && !booking.payment.razorpayPaymentId.startsWith('mock')) {
    refund = await razorpay.payments.refund(booking.payment.razorpayPaymentId, { amount: refundAmount });
  } else {
    refund = { id: `rfnd_mock_${Date.now()}` };
  }

  booking.payment.status = 'refunded';
  booking.payment.refundId = refund.id;
  booking.payment.refundedAt = new Date();
  booking.payment.refundAmount = refundAmount / 100;
  await booking.save();

  sendSuccess(res, { refundId: refund.id, amount: refundAmount / 100 }, 'Refund initiated successfully');
});

// ─── Wallet Top-up ────────────────────────────────────────────────────────────
exports.topUpWallet = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 100) throw new AppError('Minimum top-up amount is ₹100.', 400);
  if (amount > 10000) throw new AppError('Maximum top-up amount is ₹10,000.', 400);

  let order;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      notes: { type: 'wallet_topup', userId: req.user._id.toString() }
    });
  } else {
    // Dev mock: directly credit wallet
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'wallet.balance': amount } });
    return sendSuccess(res, { newBalance: req.user.wallet.balance + amount }, `₹${amount} added to wallet (mock mode)`);
  }

  sendSuccess(res, { orderId: order.id, amount: amount * 100, currency: 'INR' }, 'Wallet top-up order created');
});

// ─── Payment history ──────────────────────────────────────────────────────────
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const bookings = await Booking.find({
    user: req.user._id,
    'payment.status': 'paid'
  })
    .populate('station', 'name address.city')
    .select('bookingRef pricing payment scheduledStart status')
    .sort({ 'payment.paidAt': -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  sendSuccess(res, { payments: bookings }, 'Payment history fetched');
});
