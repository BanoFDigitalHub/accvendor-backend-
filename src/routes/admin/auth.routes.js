const express = require('express');
const controller = require('../../controllers/admin/auth.controller');
const validate = require('../../middlewares/validate.middleware');
const { requireAdminAuth } = require('../../middlewares/auth.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');
const {
  loginSchema,
  verifyLoginTwoFactorSchema,
  forgotPasswordSchema,
  getSecurityQuestionSchema,
  resetPasswordWithSecurityQuestionSchema,
} = require('../../validators/auth.validator');

const router = express.Router();

// Deliberately minimal: no signup and no OTP — admin accounts are provisioned server-side,
// so there is no self-service surface to abuse. Password recovery is here only so the admin
// login screen never has to call a public-site endpoint.
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/login/2fa', authLimiter, validate({ body: verifyLoginTwoFactorSchema }), controller.verifyLoginTwoFactor);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post(
  '/security-question',
  authLimiter,
  validate({ body: getSecurityQuestionSchema }),
  controller.getSecurityQuestion
);
router.post(
  '/reset-password/security-question',
  authLimiter,
  validate({ body: resetPasswordWithSecurityQuestionSchema }),
  controller.resetPasswordWithSecurityQuestion
);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', requireAdminAuth, controller.me);

module.exports = router;
