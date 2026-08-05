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

async function signup({ email, password, securityQuestion, securityAnswer }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const securityAnswerHash = await bcrypt.hash(normalizeAnswer(securityAnswer), env.bcryptSaltRounds);

  const otp = generateOtp();
  const otpCodeHash = await bcrypt.hash(otp, env.bcryptSaltRounds);

  // No User row is created here — only a short-lived pending record. The real account is only
  // persisted once verifyOtp() succeeds, so an abandoned/never-verified signup leaves nothing
  // behind (Mongo TTL-expires this doc automatically) and the same email can just be retried.
  await PendingSignup.findOneAndUpdate(
    { email },
    {
      email,
      passwordHash,
      securityQuestion,
      securityAnswerHash,
      otpCodeHash,
      otpExpiresAt: new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000),
      otpLastSentAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await sendMail({
    to: email,
    subject: 'Verify your Accvendor account',
    html: otpEmail(otp, env.otpExpiresMinutes),
  });

  return { email };
}

async function verifyOtp({ email, otp }) {
  const pending = await PendingSignup.findOne({ email });
  if (!pending) {
    throw new ApiError(404, 'No pending signup found for this email. Please sign up again.');
  }

  if (pending.otpExpiresAt < new Date()) {
    throw new ApiError(400, 'OTP has expired, please sign up again to request a new one');
  }

  const match = await bcrypt.compare(otp, pending.otpCodeHash);
  if (!match) throw new ApiError(400, 'Invalid OTP');

  const user = await User.create({
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
  const pending = await PendingSignup.findOne({ email });
  if (!pending) {
    throw new ApiError(404, 'No pending signup found for this email. Please sign up again.');
  }

  const secondsSinceLast = (Date.now() - pending.otpLastSentAt.getTime()) / 1000;
  if (secondsSinceLast < env.otpResendCooldownSeconds) {
    const wait = Math.ceil(env.otpResendCooldownSeconds - secondsSinceLast);
    throw new ApiError(429, `Please wait ${wait}s before requesting another OTP`);
  }

  const otp = generateOtp();
  pending.otpCodeHash = await bcrypt.hash(otp, env.bcryptSaltRounds);
  pending.otpExpiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000);
  pending.otpLastSentAt = new Date();
  await pending.save();

  await sendMail({
    to: pending.email,
    subject: 'Your new Accvendor verification code',
    html: otpEmail(otp, env.otpExpiresMinutes),
  });

  return pending;
}

async function issueTokens(user, { userAgent, ip } = {}) {
  const jti = newJti();
  user.refreshTokens.push({ jti, expiresAt: refreshExpiryDate(), userAgent, ip });
  if (user.refreshTokens.length > MAX_REFRESH_TOKENS_PER_USER) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_REFRESH_TOKENS_PER_USER);
  }
  await user.save();

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, jti);
  return { accessToken, refreshToken };
}

async function login({ email, password }, meta) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(401, 'Invalid email or password');

  if (user.isBlocked) throw new ApiError(403, 'This account has been blocked');

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

  if (user.role === 'admin' && user.totpEnabled) {
    return { requires2FA: true, pendingToken: sign2faPendingToken(user) };
  }

  const tokens = await issueTokens(user, meta);
  return { user, tokens };
}

async function verifyLoginTwoFactor({ pendingToken, code }, meta) {
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

  const tokens = await issueTokens(user, meta);
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

async function refresh(refreshToken, meta) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

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

  const tokens = await issueTokens(user, meta);
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
  issueTokens,
};
