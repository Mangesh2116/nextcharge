// ─── auth.routes.js ──────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' } });
const otpLimiter = rateLimit({ windowMs: 60 * 1000, max: 3, message: { success: false, message: 'Too many OTP requests. Wait 1 minute.' } });

router.post('/register',          authLimiter, authCtrl.register);
router.post('/login',             authLimiter, authCtrl.login);
router.post('/logout',            protect,     authCtrl.logout);
router.post('/refresh',                        authCtrl.refreshToken);
router.post('/send-otp',          otpLimiter,  authCtrl.sendPhoneOTP);
router.post('/verify-otp',                     authCtrl.verifyPhoneOTP);
router.post('/forgot-password',   authLimiter, authCtrl.forgotPassword);
router.post('/reset-password',                 authCtrl.resetPassword);
router.get('/me',                 protect,     authCtrl.getMe);

module.exports = router;
