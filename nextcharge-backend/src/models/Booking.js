const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const bookingSchema = new mongoose.Schema({
  bookingRef: {
    type: String,
    unique: true,
    default: () => `NC-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  station: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Station',
    required: true
  },
  connectorId: {
    type: String,
    required: true
  },
  vehicle: {
    make: String,
    model: String,
    licensePlate: String,
    connectorType: String
  },
  scheduledStart: {
    type: Date,
    required: true
  },
  scheduledEnd: {
    type: Date,
    required: true
  },
  actualStart: Date,
  actualEnd: Date,
  durationMinutes: Number,     // planned
  actualDurationMinutes: Number,
  status: {
    type: String,
    enum: [
      'pending',       // Created, payment pending
      'confirmed',     // Payment done, slot locked
      'in_progress',   // Charging started
      'completed',     // Charging done
      'cancelled',     // Cancelled by user
      'no_show',       // User did not arrive
      'expired'        // Slot expired without starting
    ],
    default: 'pending'
  },
  pricing: {
    pricePerKwh: Number,
    sessionStartFee: { type: Number, default: 0 },
    estimatedKwh: Number,
    estimatedAmount: Number,
    actualKwh: Number,
    actualAmount: Number,
    tax: Number,
    discount: Number,
    finalAmount: Number,
    currency: { type: String, default: 'INR' }
  },
  payment: {
    status: {
      type: String,
      enum: ['pending', 'paid', 'refunded', 'failed', 'waived'],
      default: 'pending'
    },
    method: { type: String, enum: ['upi', 'card', 'wallet', 'netbanking', 'nextcharge_wallet'] },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date,
    refundId: String,
    refundedAt: Date,
    refundAmount: Number
  },
  cancellation: {
    cancelledAt: Date,
    cancelledBy: { type: String, enum: ['user', 'operator', 'system'] },
    reason: String,
    isRefundEligible: Boolean,
    refundAmount: Number
  },
  qrToken: {
    type: String,
    default: () => uuidv4()
  },
  checkedInAt: Date,
  notes: String,
  rating: { type: Number, min: 1, max: 5 },
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Indexes
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ station: 1, scheduledStart: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ bookingRef: 1 });
bookingSchema.index({ qrToken: 1 });
bookingSchema.index({ scheduledStart: 1, scheduledEnd: 1, station: 1, connectorId: 1 });

// Virtual: is overdue
bookingSchema.virtual('isOverdue').get(function () {
  return this.status === 'confirmed' && new Date() > this.scheduledEnd;
});

// Virtual: can cancel (only up to 30 mins before)
bookingSchema.virtual('canCancel').get(function () {
  if (!['pending', 'confirmed'].includes(this.status)) return false;
  const minutesUntilStart = (this.scheduledStart - new Date()) / 60000;
  return minutesUntilStart > 30;
});

module.exports = mongoose.model('Booking', bookingSchema);
