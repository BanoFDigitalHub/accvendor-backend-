process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.CREDENTIAL_URL_SECRET = 'test_credential_secret';
process.env.BCRYPT_SALT_ROUNDS = '4';

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
  process.env.MONGODB_URI = mem.getUri('accvendor_dashboard_test');
  process.env.MONGODB_DB_NAME = 'accvendor_dashboard_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const Category = require('../src/models/Category');
  const Product = require('../src/models/Product');
  const PaymentMethod = require('../src/models/PaymentMethod');
  const { Order } = require('../src/models/Order');
  const { env } = require('../src/config/env');
  const app = require('../src/app');

  const server = app.listen(0);
  const port = server.address().port;
  env.apiUrl = `http://127.0.0.1:${port}/api`;
  const base = `http://127.0.0.1:${port}`;

  try {
    const category = await Category.create({ name: 'Streaming', slug: 'streaming' });
    const netflix = await Product.create({
      name: 'Netflix',
      slug: 'netflix',
      description: 'desc',
      category: category._id,
      price: 500,
      durationDays: 30,
      stock: 10,
    });
    const paymentMethod = await PaymentMethod.create({
      name: 'JazzCash',
      type: 'mobile_wallet',
      accountTitle: 'Test',
      accountNumber: '0300-0000000',
      isActive: true,
    });
    const passwordHash = await bcrypt.hash('Password123!', env.bcryptSaltRounds);
    const securityAnswerHash = await bcrypt.hash('answer', env.bcryptSaltRounds);
    const buyer = await User.create({
      name: 'Smoke Test User',
      email: 'dash-buyer@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
    });
    const otherUser = await User.create({
      name: 'Smoke Test User',
      email: 'dash-other@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
    });

    let res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dash-buyer@test.com', password: 'Password123!' }),
    });
    const jar = parseCookies(res);
    const authHeaders = { Cookie: cookieHeader(jar), 'Content-Type': 'application/json' };

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dash-other@test.com', password: 'Password123!' }),
    });
    const otherJar = parseCookies(res);
    const otherAuthHeaders = { Cookie: cookieHeader(otherJar), 'Content-Type': 'application/json' };

    // --- support tickets ---
    res = await fetch(`${base}/api/support/tickets`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ subject: 'Cannot log into Netflix', body: 'The password does not work.' }),
    });
    let body = await res.json();
    assert(res.status === 201, 'create ticket succeeds');
    assert(body.data.ticket.status === 'open', 'new ticket starts open');
    assert(body.data.ticket.messages.length === 1, 'ticket has the initial message');
    const ticketId = body.data.ticket._id;

    res = await fetch(`${base}/api/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ body: 'Also tried resetting the password, still broken.' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.ticket.messages.length === 2, 'follow-up message appended to thread');

    res = await fetch(`${base}/api/support/tickets`, { headers: authHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.tickets.length === 1, 'ticket list returns the created ticket');

    res = await fetch(`${base}/api/support/tickets/${ticketId}`, { headers: otherAuthHeaders });
    assert(res.status === 404, "another user cannot view someone else's ticket");

    res = await fetch(`${base}/api/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: otherAuthHeaders,
      body: JSON.stringify({ body: 'trying to reply to a ticket that is not mine' }),
    });
    assert(res.status === 404, "another user cannot reply to someone else's ticket");

    // --- cancel-subscription request ---
    const pendingOrder = await Order.create({
      user: buyer._id,
      items: [{ product: netflix._id, name: netflix.name, unitPrice: 500, quantity: 1, durationDays: 30 }],
      subtotal: 500,
      total: 500,
      paymentMethod: {
        id: paymentMethod._id,
        name: paymentMethod.name,
        accountTitle: paymentMethod.accountTitle,
        accountNumber: paymentMethod.accountNumber,
      },
      status: 'pending_payment',
      idempotencyKey: 'dash-key-1',
    });

    res = await fetch(`${base}/api/orders/${pendingOrder._id}/cancel-request`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert(res.status === 400, 'cannot request cancellation on a non-delivered order');

    const deliveredOrder = await Order.create({
      user: buyer._id,
      items: [{ product: netflix._id, name: netflix.name, unitPrice: 500, quantity: 1, durationDays: 30 }],
      subtotal: 500,
      total: 500,
      paymentMethod: {
        id: paymentMethod._id,
        name: paymentMethod.name,
        accountTitle: paymentMethod.accountTitle,
        accountNumber: paymentMethod.accountNumber,
      },
      status: 'delivered',
      credentialFileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/creds/dash.txt',
      idempotencyKey: 'dash-key-2',
    });

    res = await fetch(`${base}/api/orders/${deliveredOrder._id}/cancel-request`, {
      method: 'POST',
      headers: authHeaders,
    });
    body = await res.json();
    assert(res.status === 200 && body.data.order.cancelRequested === true, 'cancellation request succeeds on a delivered order');

    res = await fetch(`${base}/api/orders/${deliveredOrder._id}/cancel-request`, {
      method: 'POST',
      headers: authHeaders,
    });
    // 409 Conflict: the request exists already. Only one cancellation request is ever allowed
    // per order, and a decided one (approved or rejected) is terminal.
    assert(res.status === 409, 'a second cancellation request on the same order is rejected');

    res = await fetch(`${base}/api/orders/${deliveredOrder._id}/cancel-request`, {
      method: 'POST',
      headers: otherAuthHeaders,
    });
    assert(res.status === 404, "another user cannot request cancellation on someone else's order");

    // --- credential link (JSON endpoint for the dashboard button) ---
    res = await fetch(`${base}/api/orders/${deliveredOrder._id}/credential-link`, { headers: authHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.downloadUrl.includes('/credential?token='), 'credential-link endpoint returns a signed download URL');

    res = await fetch(`${base}/api/orders/${pendingOrder._id}/credential-link`, { headers: authHeaders });
    assert(res.status === 400, 'credential-link is rejected for an order that has not been delivered');

    res = await fetch(`${base}/api/orders/${deliveredOrder._id}/credential-link`, { headers: otherAuthHeaders });
    assert(res.status === 404, "another user cannot get a credential link for someone else's order");
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
