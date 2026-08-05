const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');

function handler(req, res, next) {
  next(new ApiError(429, 'Too many requests, please try again later'));
}

// Rate limiting is disabled under NODE_ENV=test so automated/integration tests
// (which legitimately fire many requests from one IP in a short window) aren't
// throttled by the same limits real clients face.
const skip = () => env.nodeEnv === 'test';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

module.exports = { globalLimiter, authLimiter, uploadLimiter };
