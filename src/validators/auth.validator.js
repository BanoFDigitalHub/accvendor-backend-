const { z } = require('zod');

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  "What is your mother's maiden name?",
  'What was the name of your first school?',
  'What was your childhood nickname?',
];

const email = z.string().trim().toLowerCase().email('Invalid email address');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(100),
  email,
  password,
  securityQuestion: z.enum(SECURITY_QUESTIONS, { error: 'Invalid security question' }),
  securityAnswer: z.string().trim().min(1, 'Security answer is required').max(200),
});

const verifyOtpSchema = z.object({
  email,
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

const resendOtpSchema = z.object({
  email,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

const totpCode = z.string().trim().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric');

const verifyLoginTwoFactorSchema = z.object({
  pendingToken: z.string().min(1, 'Pending token is required'),
  code: totpCode,
});

const forgotPasswordSchema = z.object({
  email,
});

const checkEmailSchema = z.object({
  email,
});

const resetPasswordWithTokenSchema = z.object({
  email,
  token: z.string().min(1, 'Reset token is required'),
  newPassword: password,
});

const getSecurityQuestionSchema = z.object({
  email,
});

const resetPasswordWithSecurityQuestionSchema = z.object({
  email,
  securityAnswer: z.string().trim().min(1, 'Security answer is required'),
  newPassword: password,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

const blockAppealSchema = z.object({
  email,
  message: z.string().trim().min(1, 'Message is required').max(2000),
});

/**
 * The Google ID token the browser received from Google Identity Services.
 *
 * Bounded, not parsed: a JWT is three base64url segments joined by dots, and anything that shape
 * still has to survive signature verification in google.service.js — this only keeps a
 * megabyte-long string from ever reaching the crypto. 4096 is comfortably above a real Google ID
 * token (~1KB) and far below anything worth spending CPU on.
 */
const googleAuthSchema = z.object({
  credential: z
    .string()
    .trim()
    .min(20)
    .max(4096)
    .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, 'Malformed Google credential'),
});

module.exports = {
  SECURITY_QUESTIONS,
  googleAuthSchema,
  signupSchema,
  checkEmailSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  totpCode,
  verifyLoginTwoFactorSchema,
  forgotPasswordSchema,
  resetPasswordWithTokenSchema,
  getSecurityQuestionSchema,
  resetPasswordWithSecurityQuestionSchema,
  changePasswordSchema,
  blockAppealSchema,
};
