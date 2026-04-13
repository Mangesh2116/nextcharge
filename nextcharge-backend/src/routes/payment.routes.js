const express = require('express');
const router = express.Router();
const paymentCtrl = require('../controllers/payment.controller');
const { protect, authorize } = require('../middleware/auth');

// Webhook — no auth, uses Razorpay signature verification
router.post('/webhook', express.raw({ type: 'application/json' }), paymentCtrl.webhook);

router.use(protect);

router.post('/create-order',            paymentCtrl.createOrder);
router.post('/verify',                  paymentCtrl.verifyPayment);
router.post('/wallet/topup',            paymentCtrl.topUpWallet);
router.get('/history',                  paymentCtrl.getPaymentHistory);
router.post('/refund/:bookingId',       authorize('admin'), paymentCtrl.initiateRefund);

module.exports = router;
