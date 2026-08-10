/**
 * Verifies that a public-site session and an admin session are genuinely separate
 * credentials: same account, same machine, same IP — still no crossover.
 */
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.CREDENTIAL_URL_SECRET = 'test_credential_secret';
process.env.BCRYPT_SALT_ROUNDS = '4';

const { MongoMemoryServer } = require('mongodb-memory-server');

let pass = 0;
let fail = 0;

function assert(cond, label, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ FAILED: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Minimal cookie jar so each simulated browser keeps its own cookies.
function jar() {
  const store = new Map();
  return {
    absorb(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      raw.forEach((line) => {
        const [pair] = line.split(';');
        const idx = pair.indexOf('=');
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '') store.delete(name);
        else store.set(name, value);
      });
    },
    header() {
      return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    names() {
      return [...store.keys()];
    },
  };
}

async function run() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('accvendor_scopes_test');
  process.env.MONGODB_DB_NAME = 'accvendor_scopes_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const { env } = require('../src/config/env');
  const app = require('../src/app');

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(cookies, path, { method = 'GET', body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies.header() ? { Cookie: cookies.header() } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    cookies.absorb(res);
    return { status: res.status };
  }

  try {
    const passwordHash = await bcrypt.hash('Password123!', env.bcryptSaltRounds);
    const securityAnswerHash = await bcrypt.hash('answer', env.bcryptSaltRounds);
    const common = {
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
    };
    await User.create({ ...common, name: 'Scope Admin', email: 'scope-admin@test.com', role: 'admin' });
    await User.create({ ...common, name: 'Scope Buyer', email: 'scope-buyer@test.com' });

    const creds = { email: 'scope-admin@test.com', password: 'Password123!' };

    // The admin signs into the storefront like any other customer.
    const site = jar();
    const siteLogin = await call(site, '/auth/login', { method: 'POST', body: creds });
    assert(siteLogin.status === 200, 'site login succeeds for an admin account', `got ${siteLogin.status}`);
    assert(
      site.names().includes('accessToken') && !site.names().some((n) => n.startsWith('admin')),
      'site login sets only site cookies',
      `got ${site.names().join(', ')}`
    );

    // The crux: that storefront session must not open the admin panel.
    const adminViaSite = await call(site, '/admin/dashboard/stats');
    assert(adminViaSite.status === 401, 'site session is rejected by the admin API', `got ${adminViaSite.status}`);
    const adminMeViaSite = await call(site, '/admin/auth/me');
    assert(adminMeViaSite.status === 401, 'site session is rejected by /admin/auth/me', `got ${adminMeViaSite.status}`);

    // Same machine, admin shell.
    const admin = jar();
    const adminLogin = await call(admin, '/admin/auth/login', { method: 'POST', body: creds });
    assert(adminLogin.status === 200, 'admin login succeeds', `got ${adminLogin.status}`);
    assert(
      admin.names().includes('adminAccessToken') && !admin.names().includes('accessToken'),
      'admin login sets only admin cookies',
      `got ${admin.names().join(', ')}`
    );
    assert((await call(admin, '/admin/dashboard/stats')).status === 200, 'admin session reaches the admin API');

    // ...and that admin session cannot act as the customer.
    assert((await call(admin, '/auth/me')).status === 401, 'admin session is rejected by site /auth/me');
    assert((await call(admin, '/orders')).status === 401, 'admin session is rejected by the customer orders API');

    // Both sessions live in ONE browser without merging.
    const both = jar();
    await call(both, '/auth/login', { method: 'POST', body: creds });
    await call(both, '/admin/auth/login', { method: 'POST', body: creds });
    assert(
      both.names().includes('accessToken') && both.names().includes('adminAccessToken'),
      'one browser can hold both sessions at once',
      `got ${both.names().join(', ')}`
    );
    assert((await call(both, '/admin/dashboard/stats')).status === 200, 'with both cookies, the admin API uses the admin session');
    assert((await call(both, '/auth/me')).status === 200, 'with both cookies, the site API uses the site session');

    // A non-admin can never mint an admin session.
    const buyer = jar();
    const buyerAdminLogin = await call(buyer, '/admin/auth/login', {
      method: 'POST',
      body: { email: 'scope-buyer@test.com', password: 'Password123!' },
    });
    assert(buyerAdminLogin.status === 401, 'a non-admin account cannot log into the admin panel', `got ${buyerAdminLogin.status}`);

    // Logging out of one shell leaves the other signed in.
    await call(both, '/admin/auth/logout', { method: 'POST' });
    assert((await call(both, '/admin/dashboard/stats')).status === 401, 'admin logout ends the admin session');
    assert((await call(both, '/auth/me')).status === 200, 'admin logout leaves the site session untouched');

    // --- session cap: the two shells must not evict each other -------------------------
    //
    // The refresh-token cap used to be one global list. Storefront logins therefore pushed the
    // admin panel's refresh token out of it, and an evicted token is indistinguishable from a
    // stolen one — so the next admin refresh was read as theft, revoked every session, and the
    // admin was thrown out mid-edit with "Session expired, please log in again".
    const adminOnly = jar();
    await call(adminOnly, '/admin/auth/login', { method: 'POST', body: creds });
    assert((await call(adminOnly, '/admin/dashboard/stats')).status === 200, 'admin session established');

    // Comfortably more storefront logins than the per-shell cap.
    for (let i = 0; i < 8; i += 1) {
      await call(jar(), '/auth/login', { method: 'POST', body: creds });
    }

    assert(
      (await call(adminOnly, '/admin/auth/refresh', { method: 'POST' })).status === 200,
      'the admin session still refreshes after many storefront logins (no cross-shell eviction)'
    );
    assert(
      (await call(adminOnly, '/admin/dashboard/stats')).status === 200,
      'the admin session survives storefront logins filling the session list'
    );

    // A session that simply no longer exists costs only itself. Logging one device out and
    // replaying its refresh token must not revoke the *other* devices, which is what a
    // tokenVersion bump would do.
    const deviceA = jar();
    const deviceB = jar();
    await call(deviceA, '/auth/login', { method: 'POST', body: creds });
    await call(deviceB, '/auth/login', { method: 'POST', body: creds });
    const staleRefresh = deviceA.names().includes('refreshToken');
    assert(staleRefresh, 'device A holds a refresh token');
    await call(deviceA, '/auth/logout', { method: 'POST' });

    const replayed = await call(deviceA, '/auth/refresh', { method: 'POST' });
    assert(replayed.status === 401, 'a logged-out session cannot refresh');
    assert(
      (await call(deviceB, '/auth/me')).status === 200,
      'one device logging out leaves the other device signed in'
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
