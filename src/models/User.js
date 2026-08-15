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

/**
 * Password-account fields are required unless the row is a federated (Google) one.
 *
 * Written as a named function rather than an arrow so `this` is the document being validated —
 * an arrow here would close over the module scope and the check would silently never fire.
 */
function requiredForPasswordAccounts() {
  return !this.googleId;
}

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
    // --- Credentials --------------------------------------------------------------------
    // Required only for accounts that sign in with a password. A Google account genuinely has
    // none of these — the identity is Google's — and forcing a placeholder hash in would mean
    // storing a password nobody chose and that `login()` would then happily compare against.
    // `hasPassword()` below is what every caller should ask rather than poking at the field.
    passwordHash: { type: String, required: requiredForPasswordAccounts },

    securityQuestion: { type: String, required: requiredForPasswordAccounts },
    securityAnswerHash: { type: String, required: requiredForPasswordAccounts },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Google Sign-In. Set on first federated login and never cleared: it is the link between
    // this row and the Google account, and losing it would orphan the sign-in method.
    googleId: { type: String, default: null, index: true, sparse: true },
    // Whether the row was first created by Google or by email signup. Display only — what a
    // flow may actually *do* is decided by which credentials are present, not by this.
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    avatarUrl: { type: String, default: null },

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

/**
 * Whether this account can be signed into with a password at all.
 *
 * Ask this instead of testing `passwordHash` directly: a Google-only account has none, and
 * `bcrypt.compare(input, undefined)` **rejects** rather than returning false — so a bare
 * comparison turns a wrong-method login into a 500 instead of a message that tells the person
 * which button to press.
 */
userSchema.methods.hasPassword = function hasPassword() {
  return Boolean(this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isVerified: this.isVerified,
    totpEnabled: this.totpEnabled,
    createdAt: this.createdAt,
    // The account settings page needs both: which button signed you in, and whether "change
    // password" is a thing you have. They are not the same question — a Google account that
    // has since set a password through the reset link is `google` *and* has one.
    authProvider: this.authProvider || 'local',
    hasPassword: Boolean(this.passwordHash),
    avatarUrl: this.avatarUrl || null,
  };
};

module.exports = mongoose.model('User', userSchema);
