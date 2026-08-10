const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String },
    ip: { type: String },
    // Which app-shell issued this session: 'site' or 'admin'. Sessions never cross over.
    scope: { type: String, enum: ['site', 'admin'], default: 'site' },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },

    securityQuestion: { type: String, required: true },
    securityAnswerHash: { type: String, required: true },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Google Sign-In (optional convenience path)
    googleId: { type: String, default: null, index: true, sparse: true },

    // Email verification — a User row only ever gets created post-verification (see
    // PendingSignup + auth.service.js#verifyOtp), so this is always true in practice; kept as a
    // schema-level guarantee that login() can still assert on.
    isVerified: { type: Boolean, default: false },

    // Login lockout
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // Password reset (token-link path)
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },

    // Instant token invalidation (admin block, password change, etc.)
    tokenVersion: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
    blockReason: { type: String, default: null },

    // Admin TOTP 2FA (optional add-on)
    totpSecret: { type: String, default: null },
    totpEnabled: { type: Boolean, default: false },

    // Refresh token rotation (max 5 concurrent sessions *per app-shell* — see auth.service.js)
    refreshTokens: { type: [refreshTokenSchema], default: [] },

    // Short memory of refresh tokens that have already been rotated away.
    //
    // Without it, "this jti is not in refreshTokens" has two very different causes that look
    // identical: the token was genuinely replayed (theft — revoke everything), or it was simply
    // evicted by the per-scope cap / a logout (benign — just ask for a fresh login). Treating
    // the benign case as theft is what logged admins out mid-edit with "Session expired".
    //
    // Only a jti recorded here proves a replay. Capped and pruned in auth.service.js.
    rotatedJtis: { type: [String], default: [] },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isVerified: this.isVerified,
    totpEnabled: this.totpEnabled,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
