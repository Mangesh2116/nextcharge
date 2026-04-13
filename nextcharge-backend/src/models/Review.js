const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, maxlength: 100 },
  body: { type: String, maxlength: 1000 },
  tags: [{ type: String, enum: ['fast_charging', 'clean', 'easy_to_find', 'good_amenities', 'slow', 'dirty', 'broken', 'great_location'] }],
  photos: [String],
  isVerified: { type: Boolean, default: true },  // true because tied to a booking
  operatorReply: {
    body: String,
    repliedAt: Date
  }
}, { timestamps: true });

reviewSchema.index({ station: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });

// Update station avg rating after save/remove
reviewSchema.post('save', async function () {
  const Station = require('./Station');
  const result = await mongoose.model('Review').aggregate([
    { $match: { station: this.station } },
    { $group: { _id: '$station', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  if (result.length) {
    await Station.findByIdAndUpdate(this.station, {
      'stats.avgRating': Math.round(result[0].avgRating * 10) / 10,
      'stats.totalReviews': result[0].count
    });
  }
});

module.exports = mongoose.model('Review', reviewSchema);
