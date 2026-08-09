const { authenticator } = require('otplib');
const TotpShare = require('../models/TotpShare');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');
const { encryptSecret, decryptSecret, randomToken, sha256 } = require('../utils/crypto.util');

// otplib accepts base32 with optional padding/spaces; normalise before validating so a secret
// pasted straight out of an authenticator app ("JBSW Y3DP EHPK 3PXP") is accepted.
function normalizeSecret(raw) {
  return String(raw).replace(/[\s-]/g, '').toUpperCase();
}

function assertValidSecret(secret) {
  if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length < 16) {
    throw new ApiError(400, 'That does not look like a valid 2FA secret key');
  }
  try {
    authenticator.generate(secret);
  } catch {
    throw new ApiError(400, 'That 2FA secret key could not be used to generate a code');
  }
}

/** Current code plus how long it stays valid, derived from the TOTP step boundary. */
function currentCode(secret, { period = 30, digits = 6 } = {}) {
  const instance = authenticator.clone({ step: period, digits });
  const code = instance.generate(secret);
  const secondsLeft = period - Math.floor((Date.now() / 1000) % period);
  return { code, secondsLeft, period, digits };
}

/**
 * Creates a shareable link for a TOTP secret.
 *
 * The secret is encrypted at rest and the URL carries only a random 32-byte token, of which we
 * store just the SHA-256 — so neither the link nor a database dump alone reveals the secret,
 * and the plaintext is never sent to any client. The share page asks the server for the current
 * code instead, which is what lets it work from a different browser or device with no session.
 */
async function createShare({ secret, label, digits = 6, period = 30, userId = null, ip = null }) {
  const normalized = normalizeSecret(secret);
  assertValidSecret(normalized);

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.totpShareExpiresHours * 60 * 60 * 1000);

  await TotpShare.create({
    tokenHash: sha256(token),
    secretEnc: encryptSecret(normalized),
    label: label || '',
    digits,
    period,
    expiresAt,
    createdBy: userId,
    createdByIp: ip,
  });

  return { token, expiresAt };
}

async function loadShare(token) {
  const share = await TotpShare.findOne({ tokenHash: sha256(token) });
  // One message for missing, expired and revoked alike — a probe learns nothing about which.
  if (!share || share.revokedAt || share.expiresAt <= new Date()) {
    throw new ApiError(404, 'This 2FA link is invalid, has expired, or was revoked');
  }
  return share;
}

/** Serves the current code for a share. The secret itself is never part of the response. */
async function getShareCode(token) {
  const share = await loadShare(token);

  let secret;
  try {
    secret = decryptSecret(share.secretEnc);
  } catch {
    // Only reachable if TOTP_SHARE_SECRET changed since the share was created, which is the
    // intended kill switch for every outstanding link.
    throw new ApiError(410, 'This 2FA link can no longer be decrypted and is no longer usable');
  }

  const result = currentCode(secret, { period: share.period, digits: share.digits });

  await TotpShare.updateOne({ _id: share._id }, { $inc: { views: 1 }, $set: { lastViewedAt: new Date() } });

  return { ...result, label: share.label, expiresAt: share.expiresAt };
}

async function revokeShare(token) {
  const share = await loadShare(token);
  share.revokedAt = new Date();
  await share.save();
  return true;
}

/** Stateless generator for the local tool — nothing is stored. */
function generateCode({ secret, digits = 6, period = 30 }) {
  const normalized = normalizeSecret(secret);
  assertValidSecret(normalized);
  return currentCode(normalized, { period, digits });
}

module.exports = { createShare, getShareCode, revokeShare, generateCode, normalizeSecret };
