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
  process.env.MONGODB_URI = mem.getUri('accvendor_admin_test');
  process.env.MONGODB_DB_NAME = 'accvendor_admin_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const Category = require('../src/models/Category');
  const Product = require('../src/models/Product');
  const { Review } = require('../src/models/Review');
  const { Order } = require('../src/models/Order');
  const { env } = require('../src/config/env');
  const app = require('../src/app');

  const server = app.listen(0);
  const port = server.address().port;
  env.apiUrl = `http://127.0.0.1:${port}/api`;
  const base = `http://127.0.0.1:${port}`;

  try {
    const passwordHash = await bcrypt.hash('Password123!', env.bcryptSaltRounds);
    const securityAnswerHash = await bcrypt.hash('answer', env.bcryptSaltRounds);
    const admin = await User.create({
      name: 'Smoke Test User',
      email: 'admin@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
      role: 'admin',
    });
    const buyer = await User.create({
      name: 'Smoke Test User',
      email: 'admin-test-buyer@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
    });

    let res = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'Password123!' }),
    });
    const adminJar = parseCookies(res);
    const adminHeaders = { Cookie: cookieHeader(adminJar), 'Content-Type': 'application/json' };

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin-test-buyer@test.com', password: 'Password123!' }),
    });
    const buyerJar = parseCookies(res);
    const buyerHeaders = { Cookie: cookieHeader(buyerJar), 'Content-Type': 'application/json' };

    // --- role gate ---
    res = await fetch(`${base}/api/admin/dashboard/stats`, { headers: buyerHeaders });
    assert(res.status === 401, 'a public-site session is rejected from admin routes (401)');

    // Even the admin's own storefront session must not open the admin API.
    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'Password123!' }),
    });
    const adminOnSiteHeaders = { Cookie: cookieHeader(parseCookies(res)), 'Content-Type': 'application/json' };
    res = await fetch(`${base}/api/admin/dashboard/stats`, { headers: adminOnSiteHeaders });
    assert(res.status === 401, "an admin's storefront session is still rejected from admin routes (401)");

    // A non-admin can never mint an admin-scoped session.
    res = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin-test-buyer@test.com', password: 'Password123!' }),
    });
    assert(res.status === 401, 'non-admin account cannot log into the admin panel');

    res = await fetch(`${base}/api/admin/dashboard/stats`, { headers: adminHeaders });
    let body = await res.json();
    assert(res.status === 200 && typeof body.data.totalUsers === 'number', 'admin dashboard stats endpoint works');

    // --- categories CRUD ---
    res = await fetch(`${base}/api/admin/categories`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Streaming', slug: 'streaming' }),
    });
    body = await res.json();
    assert(res.status === 201, 'admin creates a category');
    const categoryId = body.data.category._id;

    res = await fetch(`${base}/api/admin/categories/${categoryId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ description: 'Streaming services' }),
    });
    assert(res.status === 200, 'admin updates a category');

    // --- products CRUD ---
    res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Netflix',
        slug: 'netflix',
        description: 'Netflix subscription',
        category: categoryId,
        price: 500,
        durationDays: 30,
        stock: 10,
      }),
    });
    body = await res.json();
    assert(res.status === 201, 'admin creates a product');
    const productId = body.data.product._id;

    res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Netflix',
        slug: 'netflix',
        description: 'dup',
        category: categoryId,
        price: 500,
        durationDays: 30,
        stock: 10,
      }),
    });
    assert(res.status === 409, 'duplicate product slug is rejected with 409');

    res = await fetch(`${base}/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ price: 550 }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.product.price === 550, 'admin updates a product');

    res = await fetch(`${base}/api/admin/products?limit=50`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.products.length === 1, 'admin product list includes the product');

    res = await fetch(`${base}/api/admin/categories/${categoryId}`, { method: 'DELETE', headers: adminHeaders });
    assert(res.status === 400, 'cannot delete a category that still has a product assigned');

    // --- coupons CRUD ---
    res = await fetch(`${base}/api/admin/coupons`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: 'SAVE10', type: 'percentage', value: 10 }),
    });
    body = await res.json();
    assert(res.status === 201 && body.data.coupon.code === 'SAVE10', 'admin creates a coupon');
    const couponId = body.data.coupon._id;

    res = await fetch(`${base}/api/admin/coupons/${couponId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.coupon.isActive === false, 'admin deactivates a coupon');

    // --- payment methods CRUD ---
    res = await fetch(`${base}/api/admin/payment-methods`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'JazzCash', type: 'mobile_wallet', accountTitle: 'Store', accountNumber: '0300-0000000' }),
    });
    body = await res.json();
    assert(res.status === 201, 'admin creates a payment method');
    const pmId = body.data.paymentMethod._id;

    res = await fetch(`${base}/api/payment-methods`);
    body = await res.json();
    assert(res.status === 200 && body.data.paymentMethods.length === 1, 'new payment method is visible on the public endpoint');

    res = await fetch(`${base}/api/admin/payment-methods/${pmId}`, { method: 'DELETE', headers: adminHeaders });
    assert(res.status === 200, 'admin deletes a payment method');

    // --- users: block/unblock ---
    res = await fetch(`${base}/api/admin/users?limit=50`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.users.length === 2, 'admin user list returns both users');

    res = await fetch(`${base}/api/admin/users/${buyer._id}/block`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Smoke test block' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.user.isBlocked === true, "admin blocks the buyer's account");

    res = await fetch(`${base}/api/auth/me`, { headers: buyerHeaders });
    assert(res.status === 401 || res.status === 403, "blocked user's existing session is rejected immediately (tokenVersion bump)");

    res = await fetch(`${base}/api/admin/users/${admin._id}/block`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Smoke test block' }),
    });
    assert(res.status === 400, 'cannot block an admin account');

    res = await fetch(`${base}/api/admin/users/${buyer._id}/unblock`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.user.isBlocked === false, 'admin unblocks the buyer');

    // re-login the buyer since the block bumped tokenVersion and invalidated the old session
    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin-test-buyer@test.com', password: 'Password123!' }),
    });
    const buyerJar2 = parseCookies(res);
    const buyerHeaders2 = { Cookie: cookieHeader(buyerJar2), 'Content-Type': 'application/json' };

    // --- order lifecycle via admin routes ---
    const product = await Product.findById(productId);
    const order = await Order.create({
      user: buyer._id,
      items: [{ product: product._id, name: product.name, unitPrice: 550, quantity: 1, durationDays: 30 }],
      subtotal: 550,
      total: 550,
      paymentMethod: { id: pmId, name: 'JazzCash', accountTitle: 'Store', accountNumber: '0300-0000000' },
      status: 'proof_submitted',
      idempotencyKey: 'admin-test-key-1',
    });

    res = await fetch(`${base}/api/admin/orders?limit=50`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.orders.length === 1, 'admin order list returns the order');

    res = await fetch(`${base}/api/admin/orders/${order._id}/under-review`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.order.status === 'under_review', 'admin marks order under review');

    res = await fetch(`${base}/api/admin/orders/${order._id}/approve`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.order.status === 'approved', 'admin approves order');

    res = await fetch(`${base}/api/admin/orders/${order._id}/deliver`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ credentialFileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/creds/x.txt' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.order.status === 'delivered', 'admin delivers order with credentials');

    res = await fetch(`${base}/api/orders/${order._id}/cancel-request`, { method: 'POST', headers: buyerHeaders2 });
    assert(res.status === 200, 'buyer requests cancellation on the now-delivered order');

    res = await fetch(`${base}/api/admin/orders/cancel-requests`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.orders.length === 1, 'admin cancel-requests queue shows the request');

    res = await fetch(`${base}/api/admin/orders/${order._id}/confirm-cancel`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.order.status === 'cancelled', 'admin confirms the cancellation');

    // --- reviews moderation ---
    const netflixProduct = await Product.findOne({ slug: 'netflix' });
    const review = await Review.create({
      product: netflixProduct._id,
      user: buyer._id,
      rating: 5,
      comment: 'Great service',
      status: 'pending',
    });

    res = await fetch(`${base}/api/admin/reviews?status=pending`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.reviews.length === 1, 'admin sees the pending review');

    res = await fetch(`${base}/api/admin/reviews/${review._id}/approve`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.review.status === 'approved', 'admin approves a review');

    const productAfterReview = await Product.findById(netflixProduct._id).lean();
    assert(productAfterReview.reviewCount === 1 && productAfterReview.ratingAvg === 5, 'approving a review recomputes product rating/count');

    res = await fetch(`${base}/api/products/netflix/reviews`);
    body = await res.json();
    assert(
      res.status === 200 && body.data.reviews.length === 1 && body.data.reviews[0].user.reviewer.includes('*'),
      'public review list shows the approved review with a masked reviewer email'
    );

    // --- support desk (admin side) ---
    res = await fetch(`${base}/api/support/tickets`, {
      method: 'POST',
      headers: buyerHeaders2,
      body: JSON.stringify({ subject: 'Help', body: 'Need help with my order' }),
    });
    body = await res.json();
    const ticketId = body.data.ticket._id;

    res = await fetch(`${base}/api/admin/support/tickets?limit=50`, { headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.tickets.length === 1, 'admin ticket list shows the ticket');

    res = await fetch(`${base}/api/admin/support/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ body: 'We are looking into it.' }),
    });
    body = await res.json();
    assert(
      res.status === 200 && body.data.ticket.status === 'answered' && body.data.ticket.messages.length === 2,
      'admin reply appends to the thread and sets status to answered'
    );

    res = await fetch(`${base}/api/admin/support/tickets/${ticketId}/close`, { method: 'POST', headers: adminHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.ticket.status === 'closed', 'admin closes the ticket');

    res = await fetch(`${base}/api/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: buyerHeaders2,
      body: JSON.stringify({ body: 'still there?' }),
    });
    assert(res.status === 400, 'buyer cannot reply to a closed ticket');
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
