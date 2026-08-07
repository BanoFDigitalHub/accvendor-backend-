const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');

// Every token is bound to the app-shell it was issued for. A token minted by the public
// site can never satisfy an admin route and vice versa, so being signed in on one side
// grants nothing on the other — even in the same browser, from the same IP.
const SCOPE_SITE = 'site';
const SCOPE_ADMIN = 'admin';

function signAccessToken(user, scope = SCOPE_SITE) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion, scope },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpires }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

function signRefreshToken(user, jti, scope = SCOPE_SITE) {
  return jwt.sign({ sub: user._id.toString(), jti, scope }, env.jwtRefreshSecret, {
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
  SCOPE_SITE,
  SCOPE_ADMIN,
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
