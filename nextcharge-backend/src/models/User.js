const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 60
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'operator', 'admin'],
    default: 'user'
  },
  isPhoneVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  avatar: { type: String, default: null },
  vehicles: [{
    make: String,
    model: String,
    year: Number,
    connectorType: {
      type: String,
      enum: ['CCS2', 'CHAdeMO', 'Type2AC', 'BharatDC', 'GBT', 'AtherpropietaryCharger']
    },
    batteryCapacity: Number, // in kWh
    licensePlate: String,
    isPrimary: { type: Boolean, default: false }
  }],
  wallet: {
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' }
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    defaultConnector: String,
    favoriteStations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Station' }]
  },
  otp: {
    code: { type: String, select: false },
    expiresAt: { type: Date, select: false },
    type: { type: String, enum: ['phone', 'email', 'reset'], select: false }
  },
  refreshTokens: [{ type: String, select: false }],
  lastLogin: Date,
  totalSessionsCharged: { type: Number, default: 0 },
  totalKwhCharged: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  carbonSaved: { type: Number, default: 0 } // in kg
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Sanitize user output
userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  delete obj.refreshTokens;
  return obj;
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
