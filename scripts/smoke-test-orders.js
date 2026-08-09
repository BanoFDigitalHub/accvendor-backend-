process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
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
  process.env.MONGODB_URI = mem.getUri('accvendor_orders_test');
  process.env.MONGODB_DB_NAME = 'accvendor_orders_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const Category = require('../src/models/Category');
  const Product = require('../src/models/Product');
  const PaymentMethod = require('../src/models/PaymentMethod');
  const Coupon = require('../src/models/Coupon');
  const { env } = require('../src/config/env');
  const app = require('../src/app');

  const category = await Category.create({ name: 'Streaming', slug: 'streaming' });
  const netflix = await Product.create({
    name: 'Netflix',
    slug: 'netflix',
    description: 'desc',
    category: category._id,
    price: 500,
    salePrice: 450,
    durationDays: 30,
    stock: 2,
  });
  const lowStock = await Product.create({
    name: 'Rare Item',
    slug: 'rare-item',
    description: 'desc',
    category: category._id,
    price: 1000,
    durationDays: 30,
    stock: 1,
  });

  const paymentMethod = await PaymentMethod.create({
    name: 'JazzCash',
    type: 'mobile_wallet',
    accountTitle: 'Test',
    accountNumber: '0300-0000000',
    isActive: true,
  });

  await Coupon.create({
    code: 'SAVE10',
    type: 'percentage',
    value: 10,
    perUserLimit: 1,
    isActive: true,
  });

  const passwordHash = await bcrypt.hash('Password123!', env.bcryptSaltRounds);
  const securityAnswerHash = await bcrypt.hash('answer', env.bcryptSaltRounds);
  await User.create({
    name: 'Smoke Test User',
    email: 'buyer@test.com',
    passwordHash,
    securityQuestion: 'What city were you born in?',
    securityAnswerHash,
    isVerified: true,
  });

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    let res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@test.com', password: 'Password123!' }),
    });
    assert(res.status === 200, 'login succeeds');
    const jar = parseCookies(res);
    const authHeaders = { Cookie: cookieHeader(jar), 'Content-Type': 'application/json' };

    res = await fetch(`${base}/api/payment-methods`);
    let body = await res.json();
    assert(res.status === 200 && body.data.paymentMethods.length === 1, 'public payment methods list works');

    res = await fetch(`${base}/api/cart`, { headers: authHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.cart.items.length === 0, 'new cart starts empty');

    res = await fetch(`${base}/api/cart/items`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ productId: netflix._id.toString(), quantity: 2, currency: 'PKR' }),
    });
    body = await res.json();
    assert(
      res.status === 200 && body.data.cart.items.length === 1 && body.data.cart.subtotal === 900,
      'add item computes subtotal from effectivePrice (450*2=900)'
    );

    // The same cart priced in USD: 450 PKR / 280 = $1.61 a unit. Proves the cart is priced
    // server-side per currency rather than converted in the browser.
    res = await fetch(`${base}/api/cart?currency=USD`, { headers: authHeaders });
    body = await res.json();
    assert(
      res.status === 200 && body.data.cart.currency === 'USD' && body.data.cart.subtotal === 3.22,
      'cart re-prices in USD from the server'
    );
    assert(
      body.data.cart.items[0].prices.PKR.effectivePrice === 450 &&
        body.data.cart.items[0].prices.USD.effectivePrice === 1.61,
      'each cart line carries every currency so switching never refetches'
    );

    res = await fetch(`${base}/api/cart/items/${netflix._id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ quantity: 1, currency: 'PKR' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.cart.subtotal === 450, 'update quantity recomputes subtotal');

    res = await fetch(`${base}/api/coupons/validate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ code: 'SAVE10', currency: 'PKR' }),
    });
    body = await res.json();
    assert(
      res.status === 200 && body.data.discount === 45 && body.data.currency === 'PKR',
      'coupon validate computes 10% of 450 = 45 in PKR'
    );

    // Same coupon, same cart, USD. The percentage applies to the USD-resolved subtotal
    // (450 PKR / 280 = $1.61), proving the discount follows the order's currency rather
    // than being a fixed PKR figure the client could mismatch.
    res = await fetch(`${base}/api/coupons/validate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ code: 'SAVE10', currency: 'USD' }),
    });
    body = await res.json();
    assert(
      res.status === 200 && body.data.currency === 'USD' && body.data.subtotal === 1.61 && body.data.discount === 0.16,
      'coupon validate resolves the same cart in USD'
    );

    res = await fetch(`${base}/api/uploads/sign/payment-proof`, { method: 'POST', headers: authHeaders });
    assert(res.status === 501, 'upload signing returns 501 when Cloudinary is not configured');

    const idempotencyKey = 'test-key-1';
    res = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        paymentMethodId: paymentMethod._id.toString(),
        couponCode: 'SAVE10',
        currency: 'PKR',
      }),
    });
    body = await res.json();
    assert(res.status === 201, 'order creation succeeds');
    assert(
      body.data.order.subtotal === 450 && body.data.order.discount === 45 && body.data.order.total === 405,
      'order totals correct (subtotal 450, discount 45, total 405)'
    );
    assert(
      body.data.order.currency === 'PKR' && body.data.order.totalPKR === 405,
      'order snapshots the currency it was placed in, plus a PKR mirror for reporting'
    );
    assert(
      /^AV-[2-9A-HJ-NP-TV-Z]{6}$/.test(body.data.order.orderNumber || ''),
      'order receives a server-generated AV-XXXXXX order number'
    );
    assert(
      Boolean(body.data.order.paymentDueAt) &&
        new Date(body.data.order.paymentDueAt).getTime() > Date.now() + 55 * 60 * 1000,
      'order gets a ~60 minute payment window'
    );
    assert(body.data.order.status === 'pending_payment', 'new order starts as pending_payment');
    const orderId = body.data.order._id;

    const productAfter = await Product.findById(netflix._id).lean();
    assert(productAfter.stock === 1, 'stock decremented by ordered quantity (2 -> 1)');

    res = await fetch(`${base}/api/cart`, { headers: authHeaders });
    body = await res.json();
    assert(body.data.cart.items.length === 0, 'cart cleared after order creation');

    res = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ paymentMethodId: paymentMethod._id.toString() }),
    });
    body = await res.json();
    assert(
      res.status === 201 && body.data.order._id === orderId,
      'retrying the same Idempotency-Key returns the original order, not a duplicate'
    );
    const productAfterRetry = await Product.findById(netflix._id).lean();
    assert(productAfterRetry.stock === 1, 'stock is not decremented twice on idempotent retry');

    res = await fetch(`${base}/api/cart/items`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ productId: lowStock._id.toString(), quantity: 2 }),
    });
    assert(res.status === 200, 'add rare item (qty 2) to cart succeeds at cart level');

    res = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': 'test-key-2' },
      body: JSON.stringify({ paymentMethodId: paymentMethod._id.toString() }),
    });
    assert(res.status === 400, 'order creation fails when requested quantity exceeds stock (2 > 1)');
    const lowStockAfter = await Product.findById(lowStock._id).lean();
    assert(lowStockAfter.stock === 1, 'stock untouched when order creation fails');

    res = await fetch(`${base}/api/orders/${orderId}/proof`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ proofUrl: 'https://res.cloudinary.com/demo/image/upload/proof.jpg' }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.order.status === 'proof_submitted', 'proof submission transitions order status');

    res = await fetch(`${base}/api/orders`, { headers: authHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.orders.length === 1, 'order list returns the created order');

    res = await fetch(`${base}/api/orders/${orderId}`, { headers: authHeaders });
    body = await res.json();
    assert(res.status === 200 && body.data.order._id === orderId, 'order detail fetch works');

    res = await fetch(`${base}/api/cart/merge`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ items: [{ productId: netflix._id.toString(), quantity: 3 }] }),
    });
    body = await res.json();
    const mergedNetflixItem = body.data.cart.items.find((i) => i.productId === netflix._id.toString());
    assert(
      res.status === 200 && body.data.cart.items.length === 2 && mergedNetflixItem?.quantity === 3,
      'guest cart merge adds items into the account cart'
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
