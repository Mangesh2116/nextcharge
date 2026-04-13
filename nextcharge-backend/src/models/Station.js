const mongoose = require('mongoose');

const connectorSchema = new mongoose.Schema({
  id: { type: String, required: true },         // e.g. "C001"
  type: {
    type: String,
    required: true,
    enum: ['CCS2', 'CHAdeMO', 'Type2AC', 'BharatDC', 'GBT', 'AtherProprietary']
  },
  powerKw: { type: Number, required: true },     // e.g. 150
  currentType: { type: String, enum: ['AC', 'DC'], required: true },
  status: {
    type: String,
    enum: ['available', 'charging', 'reserved', 'faulted', 'offline'],
    default: 'available'
  },
  pricePerKwh: { type: Number, required: true }, // in INR
  sessionStartFee: { type: Number, default: 0 },
  currentSession: {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: Date,
    estimatedEndAt: Date
  }
});

const amenitySchema = new mongoose.Schema({
  name: String,   // e.g. "Restroom", "Cafe", "Parking", "WiFi"
  icon: String
});

const operatingHoursSchema = new mongoose.Schema({
  day: { type: String, enum: ['mon','tue','wed','thu','fri','sat','sun'] },
  open: String,  // "06:00"
  close: String, // "22:00"
  isClosed: { type: Boolean, default: false }
});

const stationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Station name is required'],
    trim: true,
    maxlength: 120
  },
  slug: { type: String, unique: true, lowercase: true },
  operator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  network: {
    type: String,
    enum: ['TataPower', 'Ather', 'BPCL', 'ChargeZone', 'Reliance', 'Fortum', 'MG', 'Independent', 'NextCharge'],
    default: 'NextCharge'
  },
  address: {
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true, match: /^\d{6}$/ },
    landmark: String
  },
  location: {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      required: true,
      validate: {
        validator: ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
        message: 'Invalid coordinates'
      }
    }
  },
  connectors: [connectorSchema],
  amenities: [amenitySchema],
  operatingHours: [operatingHoursSchema],
  is24x7: { type: Boolean, default: false },
  photos: [String],
  coverPhoto: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'coming_soon'],
    default: 'active'
  },
  // Aggregated stats (updated by cron job)
  stats: {
    totalConnectors: { type: Number, default: 0 },
    availableConnectors: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    totalKwhDelivered: { type: Number, default: 0 }
  },
  isVerified: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  maxPowerKw: Number,  // derived: max connector power
  priceRange: {
    min: Number,
    max: Number
  },
  tags: [String],    // ['highway', 'mall', 'airport', '24x7']
  qrCode: String,    // URL of the QR for this station
  ocppId: String,    // OCPP protocol station ID (for real charger integration)
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Geospatial index for "near me" queries
stationSchema.index({ location: '2dsphere' });
stationSchema.index({ 'address.city': 1 });
stationSchema.index({ status: 1 });
stationSchema.index({ network: 1 });
stationSchema.index({ isFeatured: -1 });

// Auto-compute derived fields before save
stationSchema.pre('save', function (next) {
  if (this.connectors && this.connectors.length) {
    this.stats.totalConnectors = this.connectors.length;
    this.stats.availableConnectors = this.connectors.filter(c => c.status === 'available').length;
    this.maxPowerKw = Math.max(...this.connectors.map(c => c.powerKw));
    this.priceRange = {
      min: Math.min(...this.connectors.map(c => c.pricePerKwh)),
      max: Math.max(...this.connectors.map(c => c.pricePerKwh))
    };
  }
  // Auto-generate slug
  if (!this.slug) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
  }
  next();
});

module.exports = mongoose.model('Station', stationSchema);
