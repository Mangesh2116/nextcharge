const Review = require('../models/Review');
const Booking = require('../models/Booking');
const { AppError, asyncHandler, sendSuccess, sendPaginated } = require('../utils/errors');

// ─── Create Review ────────────────────────────────────────────────────────────
exports.createReview = asyncHandler(async (req, res) => {
  const { bookingId, rating, title, body, tags } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.user.toString() !== req.user._id.toString()) throw new AppError('Access denied.', 403);
  if (booking.status !== 'completed') throw new AppError('You can only review completed sessions.', 400);
  if (booking.review) throw new AppError('You have already reviewed this session.', 409);

  const review = await Review.create({
    user: req.user._id,
    station: booking.station,
    booking: bookingId,
    rating, title, body, tags
  });

  booking.review = review._id;
  booking.rating = rating;
  await booking.save();

  sendSuccess(res, { review }, 'Review submitted. Thank you!', 201);
});

// ─── Get Station Reviews ──────────────────────────────────────────────────────
exports.getStationReviews = asyncHandler(async (req, res) => {
  const { stationId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const [reviews, total] = await Promise.all([
    Review.find({ station: stationId })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit)),
    Review.countDocuments({ station: stationId })
  ]);

  // Rating breakdown
  const breakdown = await Review.aggregate([
    { $match: { station: require('mongoose').Types.ObjectId.createFromHexString(stationId) } },
    { $group: { _id: '$rating', count: { $sum: 1 } } }
  ]);

  const ratingMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  breakdown.forEach(b => { ratingMap[b._id] = b.count; });

  sendPaginated(res, reviews, total, page, limit, 'Reviews fetched');
});

// ─── Operator Reply ───────────────────────────────────────────────────────────
exports.replyToReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.reviewId).populate('station');
  if (!review) throw new AppError('Review not found.', 404);

  if (review.station.operator.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AppError('Only the station operator can reply.', 403);
  }
  if (review.operatorReply?.body) throw new AppError('You have already replied to this review.', 400);

  review.operatorReply = { body: req.body.body, repliedAt: new Date() };
  await review.save();
  sendSuccess(res, { review }, 'Reply added');
});

// ─── Delete Review (admin) ────────────────────────────────────────────────────
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.reviewId);
  if (!review) throw new AppError('Review not found.', 404);
  if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AppError('Access denied.', 403);
  }
  await review.deleteOne();
  sendSuccess(res, {}, 'Review deleted');
});
