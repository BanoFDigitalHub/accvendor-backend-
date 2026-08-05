const { env } = require('../config/env');

const baseOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
};

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('accessToken', accessToken, {
    ...baseOptions,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    ...baseOptions,
    maxAge: env.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken', baseOptions);
  res.clearCookie('refreshToken', { ...baseOptions, path: '/api/auth' });
}

module.exports = { setAuthCookies, clearAuthCookies };
