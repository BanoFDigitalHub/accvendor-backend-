process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.BCRYPT_SALT_ROUNDS = '4'; // faster for tests

const { MongoMemoryServer } = require('mongodb-memory-server');

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
  process.env.MONGODB_URI = mem.getUri('accvendor_test');
  process.env.MONGODB_DB_NAME = 'accvendor_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const app = require('../src/app');

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const capturedOtps = {};
  const originalLog = console.log;
  console.log = (...args) => {
    const line = args.join(' ');
    const m = line.match(/Preview:.*?(\d{6})/);
    if (m) {
      const toMatch = line.match(/To:\s*(\S+)/);
      // fallback: store by insertion order key 'last'
      capturedOtps.last = m[1];
    }
    originalLog(...args);
  };

  try {
    console.log('\n== User A: happy path ==');
    const emailA = 'usera@test.com';
    const passwordA = 'Password123!';

    let res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Test User',
        email: emailA,
        password: passwordA,
        securityQuestion: 'What city were you born in?',
        securityAnswer: 'Lahore',
      }),
    });
    let body = await res.json();
    assert(res.status === 201 && body.success, 'signup returns 201');

    const otpA = capturedOtps.last;
    assert(/^\d{6}$/.test(otpA || ''), `OTP captured from stub email log (${otpA})`);

    res = await fetch(`${base}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, otp: otpA }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.isVerified === true, 'verify-otp activates account');

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: passwordA }),
    });
    body = await res.json();
    assert(res.status === 200, 'login succeeds after verification');
    let jar = parseCookies(res);
    assert(jar.accessToken && jar.refreshToken, 'login sets accessToken + refreshToken cookies');

    res = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: cookieHeader(jar) },
    });
    body = await res.json();
    assert(res.status === 200 && body.data.email === emailA, '/me returns the logged-in user');

    const oldRefreshCookie = jar.refreshToken;

    res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar) },
    });
    body = await res.json();
    assert(res.status === 200, 'refresh rotates tokens successfully');
    const jar2 = parseCookies(res);
    assert(jar2.refreshToken && jar2.refreshToken !== oldRefreshCookie, 'refresh token value changes on rotation');

    res = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: cookieHeader(jar2) },
    });
    assert(res.status === 200, 'new access token works on /me');

    // Reuse the OLD (already-rotated) refresh token -> should be detected & revoke all sessions
    res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refreshToken=${oldRefreshCookie}` },
    });
    body = await res.json();
    assert(res.status === 401, 'reusing a rotated refresh token is rejected');

    // Because reuse bumps tokenVersion, even the still-valid-looking access token from jar2 should now be dead
    res = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: cookieHeader(jar2) },
    });
    assert(res.status === 401, 'reuse detection invalidates the whole session (tokenVersion bump)');

    res = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader(jar2) },
    });
    assert(res.status === 200, 'logout succeeds');

    console.log('\n== User B: lockout after 5 failed logins ==');
    const emailB = 'userb@test.com';
    const passwordB = 'Password123!';

    await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Test User',
        email: emailB,
        password: passwordB,
        securityQuestion: 'What city were you born in?',
        securityAnswer: 'Karachi',
      }),
    });
    const otpB = capturedOtps.last;
    await fetch(`${base}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, otp: otpB }),
    });

    let lastStatus;
    for (let i = 0; i < 5; i += 1) {
      res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailB, password: 'WrongPassword!' }),
      });
      lastStatus = res.status;
    }
    assert(lastStatus === 401, '5th wrong-password attempt still reports invalid credentials');

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: passwordB }),
    });
    assert(res.status === 423, 'account locked (423) even with the CORRECT password after 5 failures');

    console.log('\n== Security-question password reset ==');
    res = await fetch(`${base}/api/auth/security-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.securityQuestion, 'security question retrievable for reset');

    res = await fetch(`${base}/api/auth/reset-password/security-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, securityAnswer: 'Lahore', newPassword: 'NewPassword456!' }),
    });
    body = await res.json();
    assert(res.status === 200, 'password reset via security question succeeds');

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: 'NewPassword456!' }),
    });
    assert(res.status === 200, 'login works with the new password');

    // --- Concurrent signup burst ---------------------------------------------------------
    // Reading the pending record and then checking its cooldown in JS is not enough: fired at
    // once, every request reads "no pending record" before any of them writes, so all of them
    // pass the check and each sends its own OTP — plus its own bcrypt hash, which is the
    // expensive part. The cooldown claim has to be the write. Regression test for that.
    const burstEmail = `burst-${Date.now()}@example.com`;
    const burstBody = JSON.stringify({
      name: 'Burst',
      email: burstEmail,
      password: 'BurstPass123!',
      securityQuestion: 'What city were you born in?',
      securityAnswer: 'lahore',
    });
    const burst = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(`${base}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: burstBody,
        })
      )
    );
    const acceptedCount = burst.filter((r) => r.status < 400).length;
    const refusedCount = burst.filter((r) => r.status === 429).length;
    assert(acceptedCount === 1, `8 simultaneous signups send exactly one OTP (got ${acceptedCount})`);
    assert(refusedCount === burst.length - 1, `the other ${refusedCount} get a controlled 429`);

    const PendingSignup = require('../src/models/PendingSignup');
    const User = require('../src/models/User');
    assert((await PendingSignup.countDocuments({ email: burstEmail })) === 1, 'only one pending signup row exists');
    assert((await User.countDocuments({ email: burstEmail })) === 0, 'no User row is created before verification');

    const refused = burst.find((r) => r.status === 429);
    const refusedBody = await refused.json();
    assert(refusedBody.data?.retryAfter > 0, `the 429 carries retryAfter for the UI countdown (${refusedBody.data?.retryAfter}s)`);
  } finally {
    console.log = originalLog;
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
