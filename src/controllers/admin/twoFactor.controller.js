const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const authService = require('../../services/auth.service');

const status = asyncHandler(async (req, res) => {
  apiResponse(res, 200, '2FA status', { enabled: req.user.totpEnabled });
});

const setup = asyncHandler(async (req, res) => {
  const data = await authService.setupTwoFactor(req.user._id);
  apiResponse(res, 200, 'Scan this in your authenticator app, then confirm with a code', data);
});

const confirm = asyncHandler(async (req, res) => {
  await authService.confirmTwoFactor(req.user._id, req.body.code);
  apiResponse(res, 200, 'Two-factor authentication enabled', { enabled: true });
});

const disable = asyncHandler(async (req, res) => {
  await authService.disableTwoFactor(req.user._id, req.body.password);
  apiResponse(res, 200, 'Two-factor authentication disabled', { enabled: false });
});

module.exports = { status, setup, confirm, disable };
