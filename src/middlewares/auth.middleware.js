const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { verifyAccessToken } = require('../utils/token.util');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.accessToken;
    if (!token) throw new ApiError(401, 'Not authenticated');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new ApiError(401, 'Invalid or expired access token');
    }

    const user = await User.findById(payload.sub).lean();
    if (!user) throw new ApiError(401, 'Invalid or expired access token');
    if (user.isBlocked) throw new ApiError(403, 'This account has been blocked');
    // tokenVersion check makes admin-block/password-reset take effect instantly,
    // even though the access token itself is still cryptographically valid for up to 15m.
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Session expired, please log in again');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Insufficient permissions'));
    next();
  };
}

module.exports = { requireAuth, requireRole };
