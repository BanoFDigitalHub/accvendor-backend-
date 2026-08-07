const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const {
  authLimiter,
  otpVerifyLimiter,
  otpResendLimiter,
  blockAppealLimiter,
  emailCheckLimiter,
} = require('../middlewares/rateLimit.middleware');
const {
  signupSchema,
  checkEmailSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  verifyLoginTwoFactorSchema,
  forgotPasswordSchema,
  getSecurityQuestionSchema,
  resetPasswordWithTokenSchema,
  resetPasswordWithSecurityQuestionSchema,
  changePasswordSchema,
  blockAppealSchema,
} = require('../validators/auth.validator');

const router = express.Router();

router.post('/signup', authLimiter, validate({ body: signupSchema }), controller.signup);
router.post('/check-email', emailCheckLimiter, validate({ body: checkEmailSchema }), controller.checkEmail);
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
router.post('/block-appeal', blockAppealLimiter, validate({ body: blockAppealSchema }), controller.blockAppeal);
router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword
);
router.get('/me', requireAuth, controller.me);
router.get('/google', controller.googleAuthStub);

module.exports = router;
