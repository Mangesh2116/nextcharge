require('dotenv').config();
const crypto = require('crypto');
const User = require('../models/User');
const { generateTokens, verifyRefreshToken, blacklistToken } = require('../utils/jwt');
const { AppError, asyncHandler, sendSuccess } = require('../utils/errors');
const { sendEmail, sendOTPSMS } = require('../services/notification.service');
const { setCache, getCache, deleteCache } = require('../config/redis');

// Helpers
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─── Register ─────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    const field = existing.email === email ? 'Email' : 'Phone number';
    throw new AppError(`${field} is already registered.`, 409);
  }

  const user = await User.create({ name, email, phone, password });

  // Send verification OTP to phone
  const otp = generateOTP();
  const ttl = parseInt(process.env.OTP_EXPIRES_IN || 10) * 60;
  await setCache(`otp:phone:${phone}`, { otp, userId: user._id }, ttl);
  await sendOTPSMS(phone, otp);

  const { accessToken, refreshToken } = await generateTokens(user._id);

  sendSuccess(res, {
    token: accessToken,
    refreshToken,
    user: user.toPublic()
  }, 'Registration successful. Please verify your phone number.', 201);
});

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { emailOrPhone, password } = req.body;

  const isEmail = emailOrPhone.includes('@');
  const query = isEmail ? { email: emailOrPhone.toLowerCase() } : { phone: emailOrPhone };

  const user = await User.findOne(query).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid credentials.', 401);
  }

  if (!user.isActive) throw new AppError('Account deactivated. Contact support.', 403);

  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

  const { accessToken, refreshToken } = await generateTokens(user._id);

  // Store refresh token
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: refreshToken }
  });

  sendSuccess(res, {
    token: accessToken,
    refreshToken,
    user: user.toPublic()
  }, 'Login successful');
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token required.', 400);

  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.id).select('+refreshTokens');
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  // Rotate: remove old, issue new
  await User.findByIdAndUpdate(user._id, {
    $pull: { refreshTokens: refreshToken }
  });

  const tokens = await generateTokens(user._id);
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: tokens.refreshToken }
  });

  sendSuccess(res, tokens, 'Token refreshed');
});

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  await blacklistToken(req.token);
  const { refreshToken } = req.body;
  if (refreshToken) {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { refreshTokens: refreshToken }
    });
  }
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, {}, 'Logged out successfully');
});

// ─── Send OTP (phone) ─────────────────────────────────────────────────────────
exports.sendPhoneOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const otp = generateOTP();
  const ttl = parseInt(process.env.OTP_EXPIRES_IN || 10) * 60;
  await setCache(`otp:phone:${phone}`, { otp }, ttl);
  await sendOTPSMS(phone, otp);
  sendSuccess(res, {}, `OTP sent to +91${phone}`);
});

// ─── Verify OTP ───────────────────────────────────────────────────────────────
exports.verifyPhoneOTP = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const cached = await getCache(`otp:phone:${phone}`);

  if (!cached || cached.otp !== otp) {
    throw new AppError('Invalid or expired OTP.', 400);
  }

  await deleteCache(`otp:phone:${phone}`);
  await User.findOneAndUpdate({ phone }, { isPhoneVerified: true });
  sendSuccess(res, {}, 'Phone verified successfully');
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw new AppError('No account found with this email.', 404);

  const resetToken = crypto.randomBytes(32).toString('hex');
  await setCache(`reset:${resetToken}`, user._id.toString(), 15 * 60);

  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  await sendEmail(email, 'passwordReset', resetLink);

  sendSuccess(res, {}, 'Password reset link sent to your email.');
});

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const userId = await getCache(`reset:${token}`);
  if (!userId) throw new AppError('Reset link is invalid or has expired.', 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  user.password = password;
  await user.save();
  await deleteCache(`reset:${token}`);
  await deleteCache(`user:${userId}`);

  sendSuccess(res, {}, 'Password reset successful. Please log in.');
});

// ─── Get current user ─────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('preferences.favoriteStations', 'name address.city');
  sendSuccess(res, { user: user.toPublic() }, 'Profile fetched');
});
