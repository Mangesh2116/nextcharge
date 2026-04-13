const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../utils/errors');
const { getCache, setCache } = require('../config/redis');

// Verify JWT and attach user to request
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Please log in.', 401));
    }

    const token = authHeader.split(' ')[1];

    // Check if token is blacklisted (logout)
    const blacklisted = await getCache(`blacklist:${token}`);
    if (blacklisted) {
      return next(new AppError('Token has been invalidated. Please log in again.', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cache user lookup for 5 minutes
    const cacheKey = `user:${decoded.id}`;
    let user = await getCache(cacheKey);

    if (!user) {
      user = await User.findById(decoded.id).select('+password');
      if (!user) return next(new AppError('User no longer exists.', 401));
      await setCache(cacheKey, user.toPublic(), 300);
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403));
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return next(new AppError('Invalid token.', 401));
    if (err.name === 'TokenExpiredError') return next(new AppError('Token expired. Please log in again.', 401));
    next(err);
  }
};

// Role-based authorization
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. Required role: ${roles.join(' or ')}.`, 403));
  }
  next();
};

// Optional auth (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.isActive) req.user = user;
  } catch (_) { /* silently ignore */ }
  next();
};

module.exports = { protect, authorize, optionalAuth };
