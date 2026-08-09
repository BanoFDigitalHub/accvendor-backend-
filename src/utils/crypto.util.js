const crypto = require('crypto');
const { env } = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM's standard nonce size

// The configured passphrase is stretched to a fixed 32-byte key so any length of
// TOTP_SHARE_SECRET works, without silently truncating or padding it.
function key() {
  return crypto.createHash('sha256').update(String(env.totpShareSecret)).digest();
}

/** AES-256-GCM encrypt. Returns `iv.tag.ciphertext`, all base64url. */
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Reverses encryptSecret. Throws if the payload was tampered with (GCM tag mismatch). */
function decryptSecret(payload) {
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');

  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** URL-safe random token for share links — 32 bytes, so guessing is not a threat model. */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

module.exports = { encryptSecret, decryptSecret, randomToken, sha256 };
