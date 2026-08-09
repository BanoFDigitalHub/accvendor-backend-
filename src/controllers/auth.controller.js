const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');
const ticketService = require('../services/supportTicket.service');
const { setAuthCookies, clearAuthCookies } = require('../utils/cookie.util');
const User = require('../models/User');
const { env } = require('../config/env');

function reqMeta(req) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

const signup = asyncHandler(async (req, res) => {
  const result = await authService.signup(req.body, reqMeta(req));
  // cooldownSeconds is echoed back so the client's countdown is driven by the server's own
  // configured value rather than a number hardcoded in the UI.
  apiResponse(res, 201, 'Account created. Please check your email for the verification code.', {
    email: result.email,
    cooldownSeconds: result.cooldownSeconds,
    otpExpiresMinutes: result.otpExpiresMinutes,
  });
});

// Pre-signup existence check so the UI can stop at the email step instead of letting the
// user fill in a password first. Discloses account existence — same accepted trade-off as
// the security-question flow (see CLAUDE.md Auth notes).
const checkEmail = asyncHandler(async (req, res) => {
  const exists = Boolean(await User.exists({ email: req.body.email }));
  apiResponse(res, 200, 'Email availability checked', { exists });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const user = await authService.verifyOtp(req.body);
  apiResponse(res, 200, 'Email verified successfully. You can now log in.', user.toSafeJSON());
});

const resendOtp = asyncHandler(async (req, res) => {
  await authService.resendOtp(req.body);
  apiResponse(res, 200, 'A new verification code has been sent to your email.', {
    cooldownSeconds: env.otpResendCooldownSeconds,
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, reqMeta(req));
  if (result.requires2FA) {
    apiResponse(res, 200, 'Two-factor authentication code required', {
      requires2FA: true,
      pendingToken: result.pendingToken,
    });
    return;
  }
  setAuthCookies(res, result.tokens);
  apiResponse(res, 200, 'Logged in successfully', result.user.toSafeJSON());
});

const verifyLoginTwoFactor = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.verifyLoginTwoFactor(req.body, reqMeta(req));
  setAuthCookies(res, tokens);
  apiResponse(res, 200, 'Logged in successfully', user.toSafeJSON());
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) throw new ApiError(401, 'Not authenticated');

  const { user, tokens } = await authService.refresh(refreshToken, reqMeta(req));
  setAuthCookies(res, tokens);
  apiResponse(res, 200, 'Token refreshed', user.toSafeJSON());
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  await authService.logout(refreshToken);
  clearAuthCookies(res);
  apiResponse(res, 200, 'Logged out successfully');
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body);
  apiResponse(res, 200, 'If an account exists for this email, a reset link has been sent.');
});

const getSecurityQuestion = asyncHandler(async (req, res) => {
  const question = await authService.getSecurityQuestion(req.body);
  apiResponse(res, 200, 'Security question found', { securityQuestion: question });
});

const resetPasswordWithToken = asyncHandler(async (req, res) => {
  await authService.resetPasswordWithToken(req.body);
  apiResponse(res, 200, 'Password reset successfully. Please log in with your new password.');
});

const resetPasswordWithSecurityQuestion = asyncHandler(async (req, res) => {
  await authService.resetPasswordWithSecurityQuestion(req.body);
  apiResponse(res, 200, 'Password reset successfully. Please log in with your new password.');
});

const changePassword = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.changePassword(req.user._id, req.body, reqMeta(req));
  setAuthCookies(res, tokens);
  apiResponse(res, 200, 'Password changed successfully', user.toSafeJSON());
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  apiResponse(res, 200, 'Current user', user.toSafeJSON());
});

const blockAppeal = asyncHandler(async (req, res) => {
  await ticketService.createBlockAppeal(req.body);
  apiResponse(res, 201, 'Your request has been sent to support.');
});

const googleAuthStub = asyncHandler(async (req, res) => {
  throw new ApiError(
    501,
    'Google Sign-In is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env to enable it. Manual email signup remains fully available.'
  );
});

module.exports = {
  signup,
  checkEmail,
  verifyOtp,
  resendOtp,
  login,
  verifyLoginTwoFactor,
  refresh,
  logout,
  forgotPassword,
  getSecurityQuestion,
  resetPasswordWithToken,
  resetPasswordWithSecurityQuestion,
  changePassword,
  me,
  blockAppeal,
  googleAuthStub,
};
