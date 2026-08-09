const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { verifyAccessToken, SCOPE_SITE, SCOPE_ADMIN } = require('../utils/token.util');
const { cookieNames } = require('../utils/cookie.util');

// Auth is scoped to the app-shell that issued the token. The public site and the admin
// panel use different cookies AND different `scope` claims, so a session on one side is
// simply not a credential on the other — same browser, same IP, same person makes no
// difference. Admin power requires a token minted by the admin login endpoint.
function authenticate(scope) {
  const names = cookieNames(scope);

  return async function authenticateMiddleware(req, res, next) {
    try {
      const token = req.cookies?.[names.access];
      if (!token) throw new ApiError(401, 'Not authenticated');

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        throw new ApiError(401, 'Invalid or expired access token');
      }

      // A token from the other shell must never authenticate here, even if it is otherwise
      // valid and belongs to an admin.
      if (payload.scope !== scope) throw new ApiError(401, 'Not authenticated');

      const user = await User.findById(payload.sub).lean();
      if (!user) throw new ApiError(401, 'Invalid or expired access token');
      if (user.isBlocked) {
        throw new ApiError(403, 'This account has been blocked', { blocked: true, blockReason: user.blockReason });
      }
      // tokenVersion check makes admin-block/password-reset take effect instantly,
      // even though the access token itself is still cryptographically valid for up to 15m.
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new ApiError(401, 'Session expired, please log in again');
      }
      // Role is re-read from the database rather than trusted from the token, so a
      // demoted admin loses access on their very next request.
      if (scope === SCOPE_ADMIN && user.role !== 'admin') {
        throw new ApiError(403, 'Insufficient permissions');
      }

      req.user = user;
      req.authScope = scope;
      next();
    } catch (err) {
      next(err);
    }
  };
}

const requireAuth = authenticate(SCOPE_SITE);
const requireAdminAuth = authenticate(SCOPE_ADMIN);

function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Insufficient permissions'));
    next();
  };
}

module.exports = { requireAuth, requireAdminAuth, requireRole };
