const mongoose = require('mongoose');

const pendingSignupSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    securityQuestion: { type: String, required: true },
    securityAnswerHash: { type: String, required: true },

    otpCodeHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true, expires: 0 }, // Mongo TTL: auto-deletes once the OTP expires
    otpLastSentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingSignup', pendingSignupSchema);
