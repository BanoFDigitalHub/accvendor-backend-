const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpires }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

function signRefreshToken(user, jti) {
  return jwt.sign({ sub: user._id.toString(), jti }, env.jwtRefreshSecret, {
    expiresIn: `${env.jwtRefreshExpiresDays}d`,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

function newJti() {
  return crypto.randomUUID();
}

function refreshExpiryDate() {
  return new Date(Date.now() + env.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000);
}

function sign2faPendingToken(user) {
  return jwt.sign({ sub: user._id.toString(), purpose: '2fa-pending' }, env.jwtAccessSecret, { expiresIn: '5m' });
}

function verify2faPendingToken(token) {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  if (payload.purpose !== '2fa-pending') throw new Error('Invalid token purpose');
  return payload;
}

function signCredentialToken(orderId, userId) {
  return jwt.sign({ orderId: String(orderId), userId: String(userId), purpose: 'credential-download' }, env.credentialUrlSecret, {
    expiresIn: `${env.credentialUrlExpiresMinutes}m`,
  });
}

function verifyCredentialToken(token) {
  const payload = jwt.verify(token, env.credentialUrlSecret);
  if (payload.purpose !== 'credential-download') throw new Error('Invalid token purpose');
  return payload;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  newJti,
  refreshExpiryDate,
  signCredentialToken,
  verifyCredentialToken,
  sign2faPendingToken,
  verify2faPendingToken,
};
