const { z } = require('zod');

const confirmTwoFactorSchema = z.object({
  code: z.string().trim().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
});

const disableTwoFactorSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

module.exports = { confirmTwoFactorSchema, disableTwoFactorSchema };
