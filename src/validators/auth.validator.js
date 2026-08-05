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

module.exports = {
  SECURITY_QUESTIONS,
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  totpCode,
  verifyLoginTwoFactorSchema,
  forgotPasswordSchema,
  resetPasswordWithTokenSchema,
  getSecurityQuestionSchema,
  resetPasswordWithSecurityQuestionSchema,
};
