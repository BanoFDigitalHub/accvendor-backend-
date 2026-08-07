const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const ApiError = require('../../utils/ApiError');
const authService = require('../../services/auth.service');
const { setAuthCookies, clearAuthCookies, cookieNames } = require('../../utils/cookie.util');
const { SCOPE_ADMIN } = require('../../utils/token.util');

// The admin panel authenticates through its own endpoints and its own cookies. Nothing
// here is reachable with a session issued by the public site, and a session issued here
// is rejected by every public/user route.

function reqMeta(req) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

const names = cookieNames(SCOPE_ADMIN);

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, reqMeta(req), SCOPE_ADMIN);
  if (result.requires2FA) {
    apiResponse(res, 200, 'Two-factor authentication code required', {
      requires2FA: true,
      pendingToken: result.pendingToken,
    });
    return;
  }
  setAuthCookies(res, result.tokens, SCOPE_ADMIN);
  apiResponse(res, 200, 'Logged in successfully', result.user.toSafeJSON());
});

const verifyLoginTwoFactor = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.verifyLoginTwoFactor(req.body, reqMeta(req), SCOPE_ADMIN);
  setAuthCookies(res, tokens, SCOPE_ADMIN);
  apiResponse(res, 200, 'Logged in successfully', user.toSafeJSON());
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[names.refresh];
  if (!refreshToken) throw new ApiError(401, 'Not authenticated');

  const { user, tokens } = await authService.refresh(refreshToken, reqMeta(req), SCOPE_ADMIN);
  setAuthCookies(res, tokens, SCOPE_ADMIN);
  apiResponse(res, 200, 'Token refreshed', user.toSafeJSON());
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[names.refresh]);
  clearAuthCookies(res, SCOPE_ADMIN);
  apiResponse(res, 200, 'Logged out');
});

// Password recovery reuses the shared service: knowing the security answer (or receiving the
// emailed link) is what authorises the reset, so there is no admin-specific privilege here.
const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body);
  apiResponse(res, 200, 'If an account exists for this email, a reset link has been sent.');
});

const getSecurityQuestion = asyncHandler(async (req, res) => {
  const securityQuestion = await authService.getSecurityQuestion(req.body);
  apiResponse(res, 200, 'Security question fetched', { securityQuestion });
});

const resetPasswordWithSecurityQuestion = asyncHandler(async (req, res) => {
  await authService.resetPasswordWithSecurityQuestion(req.body);
  apiResponse(res, 200, 'Password reset successfully. Please log in with your new password.');
});

const me = asyncHandler(async (req, res) => {
  apiResponse(res, 200, 'Current admin', {
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    totpEnabled: req.user.totpEnabled,
  });
});

module.exports = {
  login,
  verifyLoginTwoFactor,
  refresh,
  logout,
  me,
  forgotPassword,
  getSecurityQuestion,
  resetPasswordWithSecurityQuestion,
};
