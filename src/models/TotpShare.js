const mongoose = require('mongoose');

const totpShareSchema = new mongoose.Schema(
  {
    // SHA-256 of the share token, never the token itself: a database dump alone cannot be
    // replayed against the share endpoint.
    tokenHash: { type: String, required: true, unique: true, index: true },

    // AES-256-GCM ciphertext of the TOTP secret (iv:tag:payload, see utils/crypto.util.js).
    // Decrypted only for the holder of the share token, who is handed the key along with the
    // current code — see twoFactorTool.service.js#getShareCode.
    secretEnc: { type: String, required: true },

    label: { type: String, trim: true, default: '', maxlength: 100 },
    digits: { type: Number, default: 6, min: 6, max: 8 },
    period: { type: Number, default: 30, min: 10, max: 120 },
    algorithm: { type: String, default: 'SHA1' },

    // Mongo TTL: the document deletes itself the moment the share expires, so an abandoned
    // link leaves no secret material behind.
    expiresAt: { type: Date, required: true, expires: 0 },
    revokedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByIp: { type: String, default: null },
    views: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TotpShare', totpShareSchema);
