const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { authLimiter, otpVerifyLimiter, otpResendLimiter } = require('../middlewares/rateLimit.middleware');
const {
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  verifyLoginTwoFactorSchema,
  forgotPasswordSchema,
  getSecurityQuestionSchema,
  resetPasswordWithTokenSchema,
  resetPasswordWithSecurityQuestionSchema,
} = require('../validators/auth.validator');

const router = express.Router();

router.post('/signup', authLimiter, validate({ body: signupSchema }), controller.signup);
router.post('/verify-otp', otpVerifyLimiter, validate({ body: verifyOtpSchema }), controller.verifyOtp);
router.post('/resend-otp', otpResendLimiter, validate({ body: resendOtpSchema }), controller.resendOtp);
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post(
  '/login/2fa',
  authLimiter,
  validate({ body: verifyLoginTwoFactorSchema }),
  controller.verifyLoginTwoFactor
);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post(
  '/security-question',
  authLimiter,
  validate({ body: getSecurityQuestionSchema }),
  controller.getSecurityQuestion
);
router.post(
  '/reset-password/token',
  authLimiter,
  validate({ body: resetPasswordWithTokenSchema }),
  controller.resetPasswordWithToken
);
router.post(
  '/reset-password/security-question',
  authLimiter,
  validate({ body: resetPasswordWithSecurityQuestionSchema }),
  controller.resetPasswordWithSecurityQuestion
);
router.get('/me', requireAuth, controller.me);
router.get('/google', controller.googleAuthStub);

module.exports = router;
