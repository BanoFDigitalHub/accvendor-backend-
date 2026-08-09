process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.CREDENTIAL_URL_SECRET = 'test_credential_secret';
process.env.BCRYPT_SALT_ROUNDS = '4';

const { MongoMemoryServer } = require('mongodb-memory-server');
const { authenticator } = require('otplib');

let pass = 0;
let fail = 0;

function assert(cond, label) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ FAILED: ${label}`);
  }
}

function parseCookies(res) {
  const jar = {};
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookie) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function run() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('accvendor_phase7_test');
  process.env.MONGODB_DB_NAME = 'accvendor_phase7_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const { env } = require('../src/config/env');
  const app = require('../src/app');

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const passwordHash = await bcrypt.hash('Password123!', env.bcryptSaltRounds);
    const securityAnswerHash = await bcrypt.hash('answer', env.bcryptSaltRounds);
    await User.create({
      name: 'Smoke Test User',
      email: 'admin@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
      role: 'admin',
    });

    let res = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'Password123!' }),
    });
    const adminJar = parseCookies(res);
    const adminHeaders = { Cookie: cookieHeader(adminJar), 'Content-Type': 'application/json' };

    // --- Settings ---
    res = await fetch(`${base}/api/settings`);
    let body = await res.json();
    assert(res.status === 200 && body.data.settings.siteName === 'Accvendor', 'public settings endpoint returns defaults');

    res = await fetch(`${base}/api/admin/settings`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ contactEmail: 'support@accvendor.com', socialLinks: { facebook: 'https://facebook.com/accvendor' } }),
    });
    body = await res.json();
    assert(
      res.status === 200 && body.data.settings.contactEmail === 'support@accvendor.com' && body.data.settings.socialLinks.facebook === 'https://facebook.com/accvendor',
      'admin updates settings'
    );

    res = await fetch(`${base}/api/settings`);
    body = await res.json();
    assert(body.data.settings.contactEmail === 'support@accvendor.com', 'public settings reflects the update');

    // --- Ads ---
    res = await fetch(`${base}/api/admin/ads`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Homepage banner', type: 'banner', placement: 'top', imageUrl: 'https://placehold.co/728x90', linkUrl: 'https://example.com' }),
    });
    body = await res.json();
    assert(res.status === 201, 'admin creates a banner ad');
    const adId = body.data.ad._id;

    res = await fetch(`${base}/api/ads?placement=top`);
    body = await res.json();
    assert(res.status === 200 && body.data.ads.length === 1 && body.data.ads[0].id === adId, 'public ad list filters by placement');

    res = await fetch(`${base}/api/ads/${adId}/click`, { method: 'POST' });
    body = await res.json();
    assert(res.status === 200 && body.data.linkUrl === 'https://example.com', 'public click endpoint returns the link and registers a click');

    res = await fetch(`${base}/api/admin/ads/${adId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    assert(res.status === 200, 'admin deactivates an ad');

    res = await fetch(`${base}/api/ads?placement=top`);
    body = await res.json();
    assert(body.data.ads.length === 0, 'deactivated ad no longer appears on the public endpoint');

    // --- Audit log ---
    res = await fetch(`${base}/api/admin/audit-log`, { headers: adminHeaders });
    body = await res.json();
    assert(
      res.status === 200 && body.data.logs.some((l) => l.action.includes('/api/admin/ads') && l.admin.email === 'admin@test.com'),
      'audit log recorded the admin ad mutations with the admin email populated'
    );

    // --- 2FA ---
    res = await fetch(`${base}/api/admin/2fa/status`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.enabled === false, '2FA starts disabled');

    res = await fetch(`${base}/api/admin/2fa/setup`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && typeof body.data.secret === 'string' && body.data.otpauthUrl.startsWith('otpauth://'), '2FA setup returns a secret and otpauth URL');
    const secret = body.data.secret;

    res = await fetch(`${base}/api/admin/2fa/confirm`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: '000000' }),
    });
    assert(res.status === 400, '2FA confirm rejects a wrong code');

    res = await fetch(`${base}/api/admin/2fa/confirm`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: authenticator.generate(secret) }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.enabled === true, '2FA confirm enables it with a valid code');

    // Logging in again should now require the 2FA step instead of issuing a session directly.
    res = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'Password123!' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.requires2FA === true && typeof body.data.pendingToken === 'string', 'login now returns a 2FA challenge instead of a session');
    const pendingToken = body.data.pendingToken;
    const noSessionCookieJar = parseCookies(res);
    assert(!noSessionCookieJar.adminAccessToken, 'no access token cookie is set before the 2FA step is completed');

    res = await fetch(`${base}/api/admin/auth/login/2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, code: '000000' }),
    });
    assert(res.status === 401, 'wrong 2FA code at login is rejected');

    res = await fetch(`${base}/api/admin/auth/login/2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, code: authenticator.generate(secret) }),
    });
    body = await res.json();
    const sessionJar = parseCookies(res);
    assert(res.status === 200 && body.data.email === 'admin@test.com' && sessionJar.adminAccessToken, 'correct 2FA code at login issues a real session');

    const sessionHeaders = { Cookie: cookieHeader(sessionJar), 'Content-Type': 'application/json' };
    res = await fetch(`${base}/api/admin/2fa/disable`, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert(res.status === 401, '2FA disable rejects the wrong password');

    res = await fetch(`${base}/api/admin/2fa/disable`, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({ password: 'Password123!' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.enabled === false, '2FA disable succeeds with the correct password');

    res = await fetch(`${base}/api/admin/audit-log?limit=1`, { headers: sessionHeaders });
    body = await res.json();
    const disableLogEntry = body.data.logs[0];
    assert(
      disableLogEntry.action.includes('/2fa/disable') && disableLogEntry.details.password === '[redacted]',
      'audit log redacts the password field instead of storing it in plaintext'
    );
  } finally {
    server.close();
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    await mem.stop();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
