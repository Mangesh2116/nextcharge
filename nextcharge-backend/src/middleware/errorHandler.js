const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const handleCastError = (err) => new AppError(`Invalid value for field: ${err.path}`, 400);
const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return new AppError(`${field} already exists. Please use a different value.`, 409);
};
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map(e => e.message);
  return new AppError(`Validation failed: ${messages.join('. ')}`, 422);
};

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message };

  // Known error transformations
  if (err.name === 'CastError') error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateKey(err);
  if (err.name === 'ValidationError') error = handleValidationError(err);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} → ${statusCode}: ${message}`, {
      stack: err.stack,
      body: req.body,
      user: req.user?.id
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  });
};

module.exports = errorHandler;
