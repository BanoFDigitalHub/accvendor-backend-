const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');

function handler(req, res, next) {
  next(new ApiError(429, 'Too many requests, please try again later'));
}

function otpHandler(req, res, next) {
  next(new ApiError(429, 'Too many requests, please try again after 10 minutes'));
}

// Rate limiting is disabled under NODE_ENV=test so automated/integration tests
// (which legitimately fire many requests from one IP in a short window) aren't
// throttled by the same limits real clients face.
const skip = () => env.nodeEnv === 'test';

const globalLimiter = rateLimit({
  windowMs: env.rateLimit.globalWindowMinutes * 60 * 1000,
  limit: env.rateLimit.globalMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.rateLimit.uploadMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

// Dedicated buckets for the OTP verify/resend step of signup, separate from authLimiter (which
// covers login/signup/password-reset) and from each other — a few mistyped codes shouldn't burn
// the same budget as unrelated auth actions, and resending shouldn't eat into verify attempts.
// Each allows RATE_LIMIT_OTP_MAX requests per 10 minutes before blocking.
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.rateLimit.otpMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: otpHandler,
  skip,
});

const otpResendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.rateLimit.otpMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: otpHandler,
  skip,
});

// Public, unauthenticated (a blocked account's tokens are revoked, so it can't hit an
// authenticated route) — kept tight since it's reachable without a session.
const blockAppealLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

// Lightweight pre-signup email existence check — separate bucket from authLimiter so the
// check itself never burns the signup/login budget, but still bounded because it discloses
// whether an account exists (same accepted disclosure as the security-question flow).
const emailCheckLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

module.exports = {
  globalLimiter,
  authLimiter,
  uploadLimiter,
  otpVerifyLimiter,
  otpResendLimiter,
  blockAppealLimiter,
  emailCheckLimiter,
};
