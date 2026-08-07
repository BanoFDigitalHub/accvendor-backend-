const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  let { statusCode, message } = err;

  if (!statusCode) {
    // Mongoose/other unexpected errors
    if (err.name === 'ValidationError') statusCode = 400;
    else if (err.name === 'CastError') statusCode = 400;
    else if (err.code === 11000) {
      statusCode = 409;
      message = 'Duplicate value for a unique field';
    } else {
      statusCode = 500;
    }
  }
  if (!message) message = 'Internal server error';

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    data: err.details || null,
  });
}

module.exports = { notFoundHandler, errorHandler };
