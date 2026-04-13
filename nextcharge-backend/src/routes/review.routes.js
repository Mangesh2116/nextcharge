const express = require('express');
const router = express.Router();
const reviewCtrl = require('../controllers/review.controller');
const { protect, authorize } = require('../middleware/auth');

router.get('/station/:stationId',                  reviewCtrl.getStationReviews);
router.post('/',                    protect,        reviewCtrl.createReview);
router.post('/:reviewId/reply',     protect,        reviewCtrl.replyToReview);
router.delete('/:reviewId',         protect,        reviewCtrl.deleteReview);

module.exports = router;
