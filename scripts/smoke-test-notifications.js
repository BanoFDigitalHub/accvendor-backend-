process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.API_URL = 'http://127.0.0.1:0/api'; // overwritten below once we know the real port
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.CREDENTIAL_URL_SECRET = 'test_credential_secret';
process.env.CREDENTIAL_URL_EXPIRES_MINUTES = '60';
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

async function run() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('accvendor_notifications_test');
  process.env.MONGODB_DB_NAME = 'accvendor_notifications_test';

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
  const orderService = require('../src/services/order.service');
  const { verifyCredentialToken, signCredentialToken } = require('../src/utils/token.util');

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
      email: 'notify-buyer@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
    });

    async function makeOrder() {
      return Order.create({
        user: buyer._id,
        items: [
          { product: netflix._id, name: netflix.name, unitPrice: 500, quantity: 1, durationDays: 30 },
        ],
        subtotal: 500,
        total: 500,
        paymentMethod: {
          id: paymentMethod._id,
          name: paymentMethod.name,
          accountTitle: paymentMethod.accountTitle,
          accountNumber: paymentMethod.accountNumber,
        },
        status: 'proof_submitted',
        idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      });
    }

    // --- reject path ---
    const rejectOrder = await makeOrder();
    const rejected = await orderService.rejectOrder(rejectOrder._id, 'Proof image unreadable');
    assert(rejected.status === 'rejected', 'rejectOrder transitions status to rejected');
    assert(rejected.rejectionReason === 'Proof image unreadable', 'rejectOrder stores the rejection reason');
    await assertRejects(() => orderService.approveOrder(rejectOrder._id), 'rejectOrder is a terminal state (cannot approve after reject)');

    // --- approve -> deliver -> credential download path ---
    const deliverOrderDoc = await makeOrder();
    const approved = await orderService.approveOrder(deliverOrderDoc._id);
    assert(approved.status === 'approved', 'approveOrder transitions status to approved');

    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const delivered = await orderService.deliverOrder(deliverOrderDoc._id, {
      credentialFileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/creds/secret-account.txt',
      expiresAt: futureExpiry,
    });
    assert(delivered.status === 'delivered', 'deliverOrder transitions status to delivered');
    assert(delivered.credentialFileUrl.includes('secret-account.txt'), 'deliverOrder stores the credential file URL');

    const downloadUrl = await orderService.getCredentialDownloadUrl(buyer._id, deliverOrderDoc._id);
    assert(downloadUrl.includes('/credential?token='), 'getCredentialDownloadUrl builds a token-bearing URL');

    const url = new URL(downloadUrl);
    let res = await fetch(`${base}${url.pathname}${url.search}`, { redirect: 'manual' });
    assert(res.status === 302 || res.status === 301, 'credential download endpoint redirects (real request, not just unit call)');
    assert(
      res.headers.get('location') === delivered.credentialFileUrl,
      'credential download redirects to the exact stored credential URL'
    );

    // wrong order id in the URL vs. the token's orderId must be rejected
    const otherOrder = await makeOrder();
    res = await fetch(`${base}/api/orders/${otherOrder._id}/credential?token=${url.searchParams.get('token')}`, {
      redirect: 'manual',
    });
    assert(res.status === 403, 'credential token cannot be replayed against a different order id');

    // forged/garbage token must be rejected
    res = await fetch(`${base}${url.pathname}?token=not-a-real-token`, { redirect: 'manual' });
    assert(res.status === 401, 'garbage credential token is rejected with 401');

    // token for an order that hasn't been delivered must be rejected even if well-formed
    const undeliveredToken = signCredentialToken(rejectOrder._id, buyer._id);
    res = await fetch(`${base}/api/orders/${rejectOrder._id}/credential?token=${undeliveredToken}`, {
      redirect: 'manual',
    });
    assert(res.status === 404, 'well-formed token for a non-delivered order is rejected');

    const payload = verifyCredentialToken(url.searchParams.get('token'));
    assert(payload.orderId === String(deliverOrderDoc._id), 'credential token payload carries the correct orderId');

    // --- markUnderReview path ---
    const reviewOrder = await makeOrder();
    const underReview = await orderService.markUnderReview(reviewOrder._id);
    assert(underReview.status === 'under_review', 'markUnderReview transitions status to under_review');

    // --- expiry cron: order already past expiry should flip to expired ---
    const expiringOrder = await makeOrder();
    expiringOrder.status = 'delivered';
    expiringOrder.credentialFileUrl = 'https://res.cloudinary.com/demo/raw/upload/v1/creds/old.txt';
    expiringOrder.expiresAt = new Date(Date.now() - 60 * 1000); // already expired
    await expiringOrder.save();

    const stillActiveOrder = await makeOrder();
    stillActiveOrder.status = 'delivered';
    stillActiveOrder.credentialFileUrl = 'https://res.cloudinary.com/demo/raw/upload/v1/creds/active.txt';
    stillActiveOrder.expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days out, outside reminder window
    await stillActiveOrder.save();

    const soonToExpireOrder = await makeOrder();
    soonToExpireOrder.status = 'delivered';
    soonToExpireOrder.credentialFileUrl = 'https://res.cloudinary.com/demo/raw/upload/v1/creds/soon.txt';
    soonToExpireOrder.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // within the 3-day reminder window
    await soonToExpireOrder.save();

    const expiredCount = await orderService.markExpiredOrders();
    assert(expiredCount === 1, 'markExpiredOrders only flips the one order past its expiry date');
    const expiredCheck = await Order.findById(expiringOrder._id).lean();
    assert(expiredCheck.status === 'expired', 'past-due order status flips to expired');
    const activeCheck = await Order.findById(stillActiveOrder._id).lean();
    assert(activeCheck.status === 'delivered', 'not-yet-expired order is left untouched');

    const reminderCount = await orderService.sendExpiryReminders();
    assert(reminderCount === 1, 'sendExpiryReminders only reminds orders inside the reminder window');
    const remindedCheck = await Order.findById(soonToExpireOrder._id).lean();
    assert(remindedCheck.expiryReminderSentAt !== null, 'reminded order gets expiryReminderSentAt stamped');

    const secondReminderPass = await orderService.sendExpiryReminders();
    assert(secondReminderPass === 0, 'sendExpiryReminders does not re-remind an order it already reminded');
  } finally {
    server.close();
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    await mem.stop();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

async function assertRejects(fn, label) {
  try {
    await fn();
    fail += 1;
    console.log(`  ✗ FAILED: ${label} (did not throw)`);
  } catch {
    pass += 1;
    console.log(`  ✓ ${label}`);
  }
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
