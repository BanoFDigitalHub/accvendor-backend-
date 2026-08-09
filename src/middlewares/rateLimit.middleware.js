const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
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

// --- Write-side buckets for repeatable customer actions ------------------------------------
// Frontend button-disabling and idempotency keys stop the honest double-click; these stop a
// stuck retry loop or a script from turning repeated clicks into unbounded database writes.
// Keyed per authenticated user where there is a session, so one abusive account cannot
// exhaust the budget for everyone behind the same NAT/proxy IP.
// Anonymous callers fall back to their IP, normalised through express-rate-limit's own helper:
// a raw `req.ip` would give every address in an IPv6 /64 its own bucket, so one client could
// walk through addresses and bypass the limit entirely.
const perUserKey = (req) => (req.user ? `u:${req.user._id}` : ipKeyGenerator(req.ip));

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.rateLimit.orderMax,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.rateLimit.reviewMax,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

const ticketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.rateLimit.ticketMax,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

// Read-only and already debounced client-side; this is a ceiling on a pathological client,
// not a throttle real typing should ever feel. Per minute rather than per window.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.rateLimit.searchMax,
  keyGenerator: perUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skip,
});

// Public, unauthenticated write (newsletter subscribe, 2FA share creation).
const publicWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
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
  orderLimiter,
  reviewLimiter,
  ticketLimiter,
  searchLimiter,
  publicWriteLimiter,
};
