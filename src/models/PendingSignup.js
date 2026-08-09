const mongoose = require('mongoose');

const pendingSignupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    securityQuestion: { type: String, required: true },
    securityAnswerHash: { type: String, required: true },

    otpCodeHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true, expires: 0 }, // Mongo TTL: auto-deletes once the OTP expires

    // --- Server-side throttling ------------------------------------------------------
    // Every cooldown is measured against these timestamps, not against anything the client
    // reports, so refreshing the page or clearing storage cannot shorten a wait. The signup
    // and resend endpoints share `otpLastSentAt`: a repeat signup for a pending email is a
    // resend, and must obey the same cooldown.
    otpLastSentAt: { type: Date, required: true },
    otpSendCount: { type: Number, default: 1 },

    // Failed OTP verifications. Past env.otpMaxVerifyAttempts the record locks for a cooling
    // period instead of letting the code be brute-forced (10^6 space, so this matters).
    verifyAttempts: { type: Number, default: 0 },
    verifyLockedUntil: { type: Date, default: null },

    lastIp: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingSignup', pendingSignupSchema);
