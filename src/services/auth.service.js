const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const User = require('../models/User');
const PendingSignup = require('../models/PendingSignup');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');
const { generateOtp, generateResetToken } = require('../utils/otp.util');
const { sendMail } = require('./email.service');
const { otpEmail, passwordResetEmail } = require('../utils/emailTemplates');
const {
  signAccessToken,
  signRefreshToken,
  SCOPE_SITE,
  SCOPE_ADMIN,
  verifyRefreshToken,
  newJti,
  refreshExpiryDate,
  sign2faPendingToken,
  verify2faPendingToken,
} = require('../utils/token.util');

const MAX_REFRESH_TOKENS_PER_USER = 5;

function normalizeAnswer(answer) {
  return answer.trim().toLowerCase();
}

/**
 * Seconds still to wait before `lastSentAt` clears a cooldown, or 0 if it already has.
 *
 * Every cooldown in this file is measured against a timestamp stored on the pending-signup
 * record, never against anything the client reports - so refreshing the page, clearing local
 * storage or opening a second tab cannot shorten a wait.
 */
function cooldownRemaining(lastSentAt, cooldownSeconds) {
  if (!lastSentAt) return 0;
  const elapsed = (Date.now() - new Date(lastSentAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
}

// 429 with the remaining seconds attached, so the client can show a live countdown rather than
// guessing. Deliberately a controlled response - never a crash, and never a duplicate send.
function tooSoonError(retryAfter) {
  return new ApiError(429, `Please wait ${retryAfter}s before requesting again`, { retryAfter });
}

/**
 * Atomically claims the right to send one OTP for `email`, or throws 429.
 *
 * Reading the record and then checking its cooldown in JS is not enough: ten submits fired at
 * once all read "no pending record" before any of them writes, so all ten pass the check and
 * ten OTP emails go out — along with ten bcrypt hashes, which is the expensive part and a real
 * denial-of-service lever. The check has to be the write.
 *
 * The filter matches only a record whose cooldown has already elapsed. With `upsert`, a record
 * that exists but is still cooling down matches nothing, so Mongo attempts an insert and the
 * unique index on `email` rejects it with E11000 — and that duplicate-key error is precisely
 * the signal that another request already holds the slot. Two simultaneous first-time signups
 * race the same way: one insert wins, the other gets E11000.
 *
 * Returns the claimed record; the caller then fills in the rest of the fields.
 */
async function claimOtpSlot(email, cooldownSeconds) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - cooldownSeconds * 1000);

  try {
    return await PendingSignup.findOneAndUpdate(
      { email, $or: [{ otpLastSentAt: null }, { otpLastSentAt: { $lte: cutoff } }] },
      { $set: { email, otpLastSentAt: now }, $inc: { otpSendCount: 1 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Someone else holds the slot — report how long is actually left on their timestamp.
    const holder = await PendingSignup.findOne({ email }).select('otpLastSentAt').lean();
    throw tooSoonError(cooldownRemaining(holder?.otpLastSentAt, cooldownSeconds) || cooldownSeconds);
  }
}

async function signup({ name, email, password, securityQuestion, securityAnswer }, meta = {}) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  // A repeat signup for an email that already has a pending record *is* a resend, so it obeys
  // the same cooldown. Claiming the slot atomically — before any hashing — is what makes a
  // burst of double-clicks collapse into one OTP and one email instead of one per click.
  await claimOtpSlot(email, env.signupCooldownSeconds);

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const securityAnswerHash = await bcrypt.hash(normalizeAnswer(securityAnswer), env.bcryptSaltRounds);

  const otp = generateOtp();
  const otpCodeHash = await bcrypt.hash(otp, env.bcryptSaltRounds);

  // No User row is created here — only a short-lived pending record. The real account is only
  // persisted once verifyOtp() succeeds, so an abandoned/never-verified signup leaves nothing
  // behind (Mongo TTL-expires this doc automatically) and the same email can just be retried.
  // The slot (and otpLastSentAt/otpSendCount) was already claimed above — this fills in the
  // rest of the record for the code we just generated.
  await PendingSignup.updateOne(
    { email },
    {
      $set: {
        name,
        passwordHash,
        securityQuestion,
        securityAnswerHash,
        otpCodeHash,
        otpExpiresAt: new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000),
        // A fresh code resets the verification attempt budget and any lock it earned.
        verifyAttempts: 0,
        verifyLockedUntil: null,
        lastIp: meta.ip || null,
      },
    }
  );

  await sendMail({
    to: email,
    subject: 'Verify your Accvendor account',
    html: otpEmail(otp, env.otpExpiresMinutes),
  });

  return { email, cooldownSeconds: env.signupCooldownSeconds, otpExpiresMinutes: env.otpExpiresMinutes };
}

async function verifyOtp({ email, otp }) {
  const pending = await PendingSignup.findOne({ email });
  if (!pending) {
    throw new ApiError(404, 'No pending signup found for this email. Please sign up again.');
  }

  // A six-digit code is a 10^6 space, so unlimited guesses would be brute-forceable in
  // minutes. Past the attempt budget the record locks for a cooling period; the lock lives on
  // the record, so it survives a refresh, a new tab, or a different IP.
  if (pending.verifyLockedUntil && pending.verifyLockedUntil > new Date()) {
    const retryAfter = Math.ceil((pending.verifyLockedUntil.getTime() - Date.now()) / 1000);
    throw new ApiError(429, `Too many incorrect codes. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`, {
      retryAfter,
    });
  }

  if (pending.otpExpiresAt < new Date()) {
    throw new ApiError(400, 'OTP expired. Request a new OTP.', { expired: true });
  }

  const match = await bcrypt.compare(otp, pending.otpCodeHash);
  if (!match) {
    pending.verifyAttempts += 1;
    const locked = pending.verifyAttempts >= env.otpMaxVerifyAttempts;
    if (locked) {
      pending.verifyLockedUntil = new Date(Date.now() + env.otpVerifyLockMinutes * 60 * 1000);
      pending.verifyAttempts = 0;
    }
    await pending.save();

    const left = locked ? 0 : env.otpMaxVerifyAttempts - pending.verifyAttempts;
    throw new ApiError(
      400,
      left > 0 ? `Invalid OTP. ${left} attempt${left === 1 ? '' : 's'} remaining.` : 'Invalid OTP',
      { attemptsRemaining: left }
    );
  }

  const user = await User.create({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
    securityQuestion: pending.securityQuestion,
    securityAnswerHash: pending.securityAnswerHash,
    isVerified: true,
  });
  await PendingSignup.deleteOne({ _id: pending._id });

  return user;
}

async function resendOtp({ email }) {
  const exists = await PendingSignup.exists({ email });
  if (!exists) {
    throw new ApiError(404, 'No pending signup found for this email. Please sign up again.');
  }

  // Same atomic claim as signup — a burst of "Resend" clicks must produce one code, not one
  // per click. Claiming before the bcrypt hash also keeps the expensive work behind the gate.
  await claimOtpSlot(email, env.otpResendCooldownSeconds);

  const otp = generateOtp();
  await PendingSignup.updateOne(
    { email },
    {
      $set: {
        otpCodeHash: await bcrypt.hash(otp, env.bcryptSaltRounds),
        otpExpiresAt: new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000),
        // Issuing a new code restores the attempt budget - the old code is dead either way.
        verifyAttempts: 0,
        verifyLockedUntil: null,
      },
    }
  );

  await sendMail({
    to: email,
    subject: 'Your new Accvendor verification code',
    html: otpEmail(otp, env.otpExpiresMinutes),
  });

  return PendingSignup.findOne({ email });
}

async function issueTokens(user, { userAgent, ip } = {}, scope = SCOPE_SITE) {
  const jti = newJti();
  user.refreshTokens.push({ jti, expiresAt: refreshExpiryDate(), userAgent, ip, scope });
  if (user.refreshTokens.length > MAX_REFRESH_TOKENS_PER_USER) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_REFRESH_TOKENS_PER_USER);
  }
  await user.save();

  const accessToken = signAccessToken(user, scope);
  const refreshToken = signRefreshToken(user, jti, scope);
  return { accessToken, refreshToken };
}

async function login({ email, password }, meta, scope = SCOPE_SITE) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(401, 'Invalid email or password');

  if (user.isBlocked) {
    throw new ApiError(403, 'This account has been blocked', { blocked: true, blockReason: user.blockReason });
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(423, `Account locked due to too many failed attempts. Try again in ${minutes} minute(s)`);
  }

  if (!user.isVerified) throw new ApiError(403, 'Please verify your email before logging in');

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= env.loginMaxAttempts) {
      user.lockUntil = new Date(Date.now() + env.loginLockoutMinutes * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw new ApiError(401, 'Invalid email or password');
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Only the admin login endpoint can mint admin-scoped sessions, and only for admins.
  if (scope === SCOPE_ADMIN && user.role !== 'admin') {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.role === 'admin' && user.totpEnabled && scope === SCOPE_ADMIN) {
    return { requires2FA: true, pendingToken: sign2faPendingToken(user) };
  }

  const tokens = await issueTokens(user, meta, scope);
  return { user, tokens };
}

async function verifyLoginTwoFactor({ pendingToken, code }, meta, scope = SCOPE_ADMIN) {
  let payload;
  try {
    payload = verify2faPendingToken(pendingToken);
  } catch {
    throw new ApiError(401, 'Two-factor challenge expired, please log in again');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.totpEnabled || !user.totpSecret) throw new ApiError(401, 'Two-factor challenge expired, please log in again');
  if (user.isBlocked) throw new ApiError(403, 'This account has been blocked');

  const valid = authenticator.verify({ token: code, secret: user.totpSecret });
  if (!valid) throw new ApiError(401, 'Invalid authentication code');

  if (scope === SCOPE_ADMIN && user.role !== 'admin') throw new ApiError(403, 'Insufficient permissions');

  const tokens = await issueTokens(user, meta, scope);
  return { user, tokens };
}

async function setupTwoFactor(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const secret = authenticator.generateSecret();
  user.totpSecret = secret;
  user.totpEnabled = false;
  await user.save();

  const otpauthUrl = authenticator.keyuri(user.email, 'Accvendor', secret);
  return { secret, otpauthUrl };
}

async function confirmTwoFactor(userId, code) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.totpSecret) throw new ApiError(400, 'Start 2FA setup first');

  const valid = authenticator.verify({ token: code, secret: user.totpSecret });
  if (!valid) throw new ApiError(400, 'Invalid authentication code');

  user.totpEnabled = true;
  await user.save();
  return user;
}

async function disableTwoFactor(userId, password) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, 'Incorrect password');

  user.totpSecret = null;
  user.totpEnabled = false;
  await user.save();
  return user;
}

async function refresh(refreshToken, meta, scope = SCOPE_SITE) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  // A refresh token from the other app-shell cannot be upgraded into a session here.
  if ((payload.scope || SCOPE_SITE) !== scope) throw new ApiError(401, 'Invalid refresh token');

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Invalid refresh token');

  const tokenEntry = user.refreshTokens.find((t) => t.jti === payload.jti);
  if (!tokenEntry) {
    // Reuse of a rotated/unknown token: possible theft. Revoke all sessions.
    user.refreshTokens = [];
    user.tokenVersion += 1;
    await user.save();
    throw new ApiError(401, 'Refresh token reuse detected, all sessions revoked. Please log in again');
  }

  // Rotate: remove used token, issue a new one.
  user.refreshTokens = user.refreshTokens.filter((t) => t.jti !== payload.jti);
  await user.save();

  if (scope === SCOPE_ADMIN && user.role !== 'admin') throw new ApiError(403, 'Insufficient permissions');

  const tokens = await issueTokens(user, meta, scope);
  return { user, tokens };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub);
    if (!user) return;
    user.refreshTokens = user.refreshTokens.filter((t) => t.jti !== payload.jti);
    await user.save();
  } catch {
    // Token already invalid/expired — nothing to revoke.
  }
}

async function forgotPassword({ email }) {
  const user = await User.findOne({ email });
  if (!user) return; // Don't reveal account existence

  const token = generateResetToken();
  user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  user.resetTokenExpiresAt = new Date(Date.now() + env.resetTokenExpiresMinutes * 60 * 1000);
  await user.save();

  const link = `${env.clientUrl}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Accvendor password',
    html: passwordResetEmail(link, env.resetTokenExpiresMinutes),
  });
}

async function resetPasswordWithToken({ email, token, newPassword }) {
  const user = await User.findOne({ email });
  if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }
  if (user.resetTokenExpiresAt < new Date()) {
    throw new ApiError(400, 'Reset token has expired');
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (tokenHash !== user.resetTokenHash) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }

  await applyPasswordReset(user, newPassword);
}

async function getSecurityQuestion({ email }) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, 'Account not found');
  return user.securityQuestion;
}

async function resetPasswordWithSecurityQuestion({ email, securityAnswer, newPassword }) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, 'Account not found');

  const match = await bcrypt.compare(normalizeAnswer(securityAnswer), user.securityAnswerHash);
  if (!match) throw new ApiError(400, 'Incorrect security answer');

  await applyPasswordReset(user, newPassword);
}

async function changePassword(userId, { currentPassword, newPassword }, meta) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new ApiError(401, 'Current password is incorrect');

  // Reuses the same invalidate-everything semantics as a forced reset, then immediately
  // re-issues fresh tokens for this session so the user isn't logged out by their own action —
  // any other logged-in devices/sessions do get signed out, which is the intended behavior.
  await applyPasswordReset(user, newPassword);
  const tokens = await issueTokens(user, meta);
  return { user, tokens };
}

async function applyPasswordReset(user, newPassword) {
  user.passwordHash = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  user.tokenVersion += 1; // invalidate all existing access tokens
  user.refreshTokens = []; // force re-login everywhere
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();
}

module.exports = {
  cooldownRemaining,
  signup,
  verifyOtp,
  resendOtp,
  login,
  verifyLoginTwoFactor,
  setupTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  refresh,
  logout,
  forgotPassword,
  resetPasswordWithToken,
  getSecurityQuestion,
  resetPasswordWithSecurityQuestion,
  changePassword,
  issueTokens,
};
