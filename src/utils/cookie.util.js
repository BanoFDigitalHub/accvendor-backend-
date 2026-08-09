const { env } = require('../config/env');
const { SCOPE_SITE, SCOPE_ADMIN } = require('./token.util');

// SameSite=None requires Secure, so the two always move together.
const baseOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production' || env.cookieSameSite === 'none',
  sameSite: env.cookieSameSite,
};

// Separate cookie names per app-shell so a site session and an admin session can coexist
// in one browser without either overwriting — or inheriting — the other.
const COOKIE_NAMES = {
  [SCOPE_SITE]: { access: 'accessToken', refresh: 'refreshToken' },
  [SCOPE_ADMIN]: { access: 'adminAccessToken', refresh: 'adminRefreshToken' },
};

const REFRESH_PATHS = {
  [SCOPE_SITE]: '/api/auth',
  [SCOPE_ADMIN]: '/api/admin/auth',
};

function cookieNames(scope = SCOPE_SITE) {
  return COOKIE_NAMES[scope] || COOKIE_NAMES[SCOPE_SITE];
}

function setAuthCookies(res, { accessToken, refreshToken }, scope = SCOPE_SITE) {
  const names = cookieNames(scope);
  res.cookie(names.access, accessToken, {
    ...baseOptions,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(names.refresh, refreshToken, {
    ...baseOptions,
    maxAge: env.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000,
    path: REFRESH_PATHS[scope] || REFRESH_PATHS[SCOPE_SITE],
  });
}

function clearAuthCookies(res, scope = SCOPE_SITE) {
  const names = cookieNames(scope);
  res.clearCookie(names.access, baseOptions);
  res.clearCookie(names.refresh, { ...baseOptions, path: REFRESH_PATHS[scope] || REFRESH_PATHS[SCOPE_SITE] });
}

module.exports = { setAuthCookies, clearAuthCookies, cookieNames };
