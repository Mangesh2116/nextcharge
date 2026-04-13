const express = require('express');
const router = express.Router();
const bookingCtrl = require('../controllers/booking.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/',                        bookingCtrl.createBooking);
router.get('/',                         bookingCtrl.getMyBookings);
router.get('/:id',                      bookingCtrl.getBooking);
router.patch('/:id/cancel',             bookingCtrl.cancelBooking);
router.post('/check-in',                bookingCtrl.checkIn);
router.post('/complete',                authorize('operator', 'admin'), bookingCtrl.completeSession);

module.exports = router;
