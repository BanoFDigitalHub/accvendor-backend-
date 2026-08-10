/**
 * Product edit round-trip + the warranty-driven cancellation window.
 *
 * Two things are proved here, both reported as broken:
 *
 *  1. An admin edit reaches the public API. Every field the admin form writes — name, each
 *     currency's price, images, description, warranty, validity — is read back from the public
 *     product endpoint after the PATCH, on the same product `_id`. The headline case is a USD
 *     price going from 2 to 4 and the storefront answering 4.
 *  2. Warranty governs cancellation, and validity does not. A delivered order can be cancelled
 *     while its warranty window is open, cannot once it has closed, and is unrestricted when the
 *     product carries no warranty at all — regardless of how much validity is left in any case.
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
  process.env.MONGODB_URI = mem.getUri('accvendor_product_edit_test');
  process.env.MONGODB_DB_NAME = 'accvendor_product_edit_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const Category = require('../src/models/Category');
  const Product = require('../src/models/Product');
  const PaymentMethod = require('../src/models/PaymentMethod');
  const { Order } = require('../src/models/Order');
  const Settings = require('../src/models/Settings');
  const { env } = require('../src/config/env');
  const app = require('../src/app');

  const server = app.listen(0);
  const port = server.address().port;
  env.apiUrl = `http://127.0.0.1:${port}/api`;
  const base = `http://127.0.0.1:${port}`;

  try {
    const passwordHash = await bcrypt.hash('Password123!', env.bcryptSaltRounds);
    const securityAnswerHash = await bcrypt.hash('answer', env.bcryptSaltRounds);
    await User.create({
      name: 'Edit Admin',
      email: 'edit-admin@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
      role: 'admin',
    });
    const buyer = await User.create({
      name: 'Edit Buyer',
      email: 'edit-buyer@test.com',
      passwordHash,
      securityQuestion: 'What city were you born in?',
      securityAnswerHash,
      isVerified: true,
    });

    // A known USD rate, so "no explicit USD price" has a predictable converted value to
    // contrast the explicit one against.
    await Settings.findOneAndUpdate(
      { singleton: 'main' },
      { $set: { usdRate: 280, eurRate: 300, defaultCurrency: 'USD' } },
      { upsert: true, new: true }
    );

    const category = await Category.create({ name: 'Streaming', slug: 'streaming' });
    const paymentMethod = await PaymentMethod.create({
      name: 'JazzCash',
      type: 'mobile_wallet',
      accountTitle: 'Accvendor',
      accountNumber: '0300-0000000',
    });

    let res = await fetch(`${base}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'edit-admin@test.com', password: 'Password123!' }),
    });
    const adminHeaders = { Cookie: cookieHeader(parseCookies(res)), 'Content-Type': 'application/json' };

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'edit-buyer@test.com', password: 'Password123!' }),
    });
    const buyerHeaders = { Cookie: cookieHeader(parseCookies(res)), 'Content-Type': 'application/json' };

    const publicProduct = async (slug) => {
      const r = await fetch(`${base}/api/products/${slug}`);
      const b = await r.json();
      return b.data?.product;
    };

    // --- create -----------------------------------------------------------------------
    console.log('\n  Product create');
    res = await fetch(`${base}/api/admin/products`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Netflix Premium',
        slug: 'netflix-premium',
        description: 'Original description.',
        media: [{ url: 'https://cdn.test/one.jpg', publicId: 'accvendor/one' }],
        tags: ['Private', '1 Month'],
        category: String(category._id),
        price: 560,
        usdPrice: 2,
        durationDays: 30,
        validity: '1 Month',
        warrantyDays: 7,
        warranty: '7 Days Warranty',
        stock: 10,
      }),
    });
    let body = await res.json();
    assert(res.status === 201, 'admin creates a product');
    const productId = body.data.product._id;
    assert(body.data.product.prices?.USD?.effectivePrice === 2, 'create response carries the resolved prices block');
    assert(body.data.product.category?.name === 'Streaming', 'create response carries the populated category');

    let pub = await publicProduct('netflix-premium');
    assert(pub.prices.USD.effectivePrice === 2, 'public API shows the created USD price ($2)');
    assert(pub.warrantyDays === 7 && pub.warranty === '7 Days Warranty', 'public API exposes the warranty');
    assert(pub.validity === '1 Month' && pub.durationDays === 30, 'public API exposes validity separately');

    // --- the reported case: $2 -> $4 --------------------------------------------------
    console.log('\n  Price edit ($2 -> $4)');
    res = await fetch(`${base}/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ usdPrice: 4 }),
    });
    body = await res.json();
    assert(res.status === 200, 'admin PATCHes the USD price');
    assert(body.data.product.prices.USD.effectivePrice === 4, 'PATCH response already shows $4');

    pub = await publicProduct('netflix-premium');
    assert(pub.prices.USD.effectivePrice === 4, 'public API shows $4 immediately after the edit');
    assert(String(pub.id) === String(productId), 'the product keeps its database identity across the edit');

    // A partial PATCH must not blank the fields it did not mention.
    assert(pub.warranty === '7 Days Warranty', 'a price-only PATCH leaves the warranty untouched');
    assert(pub.validity === '1 Month', 'a price-only PATCH leaves the validity untouched');
    assert(pub.tags.length === 2, 'a price-only PATCH leaves the tags untouched');
    assert(pub.name === 'Netflix Premium', 'a price-only PATCH leaves the name untouched');

    // --- every other editable field ---------------------------------------------------
    console.log('\n  Name / description / images / warranty edit');
    res = await fetch(`${base}/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Netflix Ultra',
        description: 'Updated description with warranty details.',
        media: [{ url: 'https://cdn.test/two.jpg', publicId: 'accvendor/two' }],
        price: 1120,
        warrantyDays: 14,
        warranty: '14 Days Warranty',
        validity: '2 Months',
        durationDays: 60,
        stock: 3,
      }),
    });
    assert(res.status === 200, 'admin PATCHes the remaining fields');

    pub = await publicProduct('netflix-premium');
    assert(pub.name === 'Netflix Ultra', 'name edit reaches the public API');
    assert(pub.description === 'Updated description with warranty details.', 'description edit reaches the public API');
    assert(pub.images.length === 1 && pub.images[0].includes('two.jpg'), 'image edit reaches the public API');
    assert(pub.prices.PKR.effectivePrice === 1120, 'PKR price edit reaches the public API');
    assert(pub.warrantyDays === 14 && pub.warranty === '14 Days Warranty', 'warranty edit reaches the public API');
    assert(pub.validity === '2 Months' && pub.durationDays === 60, 'validity edit reaches the public API');
    assert(pub.stock === 3, 'stock edit reaches the public API');
    assert(String(pub.id) === String(productId), 'the product id is still unchanged after a full edit');

    // `images` and `media` must never drift apart, whichever one the caller wrote.
    let stored = await Product.findById(productId).lean();
    assert(
      stored.images.length === 1 && stored.media.length === 1 && stored.images[0] === stored.media[0].url,
      'images[] stays mirrored from media[] after an image edit'
    );
    assert(stored.media[0].publicId === 'accvendor/two', 'the replacing image keeps its Cloudinary publicId');

    // A caller that sends back only URLs (no publicId) must not strip our ownership of them.
    res = await fetch(`${base}/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ images: ['https://cdn.test/two.jpg'], price: 1130 }),
    });
    assert(res.status === 200, 'admin PATCHes with a bare images[] array');
    stored = await Product.findById(productId).lean();
    assert(stored.media[0].publicId === 'accvendor/two', 'a bare images[] PATCH preserves the existing publicId');

    // A pasted third-party URL — no Cloudinary publicId, because it is not ours to destroy —
    // must save and reach the storefront exactly like an uploaded one.
    res = await fetch(`${base}/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        media: [
          { url: 'https://cdn.test/two.jpg', publicId: 'accvendor/two' },
          { url: 'https://images.example.com/pasted-image.png', publicId: null },
        ],
      }),
    });
    assert(res.status === 200, 'admin adds a pasted image URL alongside an uploaded one');
    pub = await publicProduct('netflix-premium');
    assert(
      pub.images.length === 2 && pub.images.some((u) => u.includes('pasted-image.png')),
      'a pasted image URL reaches the public API'
    );
    stored = await Product.findById(productId).lean();
    assert(stored.images.length === 2, 'a pasted image URL is mirrored into images[]');
    assert(stored.media[1].publicId === null, 'a pasted image URL is stored without a publicId');

    // Clearing an explicit currency falls back to the rate, rather than pricing it at zero.
    res = await fetch(`${base}/api/admin/products/${productId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ usdPrice: null }),
    });
    assert(res.status === 200, 'admin clears the explicit USD price');
    pub = await publicProduct('netflix-premium');
    assert(
      pub.prices.USD.explicit === false && pub.prices.USD.effectivePrice === Math.round((1130 / 280) * 100) / 100,
      'a cleared USD price falls back to the Settings rate instead of 0'
    );

    // --- warranty governs cancellation ------------------------------------------------
    console.log('\n  Warranty-driven cancellation window');

    const orderFor = async (key, warrantyDays) => {
      const order = await Order.create({
        user: buyer._id,
        items: [
          {
            product: productId,
            name: 'Netflix Ultra',
            unitPrice: 1130,
            quantity: 1,
            durationDays: 60,
            warrantyDays,
          },
        ],
        currency: 'PKR',
        subtotal: 1130,
        total: 1130,
        paymentMethod: {
          id: paymentMethod._id,
          name: paymentMethod.name,
          accountTitle: paymentMethod.accountTitle,
          accountNumber: paymentMethod.accountNumber,
        },
        status: 'approved',
        idempotencyKey: key,
      });
      // Deliver through the real admin endpoint, which is what stamps the warranty deadline.
      const r = await fetch(`${base}/api/admin/orders/${order._id}/deliver`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          credentialText: 'user / pass',
          // A validity far in the future, so nothing below can be passing for that reason.
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      return { order, delivered: (await r.json()).data.order };
    };

    const covered = await orderFor('edit-key-covered', 14);
    assert(Boolean(covered.delivered.warrantyUntil), 'delivering stamps a warranty deadline');
    assert(covered.delivered.canRequestCancellation === true, 'a delivered order inside its warranty may be cancelled');

    res = await fetch(`${base}/api/orders/${covered.order._id}/cancel-request`, {
      method: 'POST',
      headers: buyerHeaders,
    });
    body = await res.json();
    assert(res.status === 200 && body.data.order.cancelRequested === true, 'cancellation succeeds inside the warranty');
    assert(
      body.data.order.canRequestCancellation === false,
      'the order reports no further cancellation once one is pending'
    );

    // Same order shape, but the warranty has already run out.
    const lapsed = await orderFor('edit-key-lapsed', 14);
    await Order.updateOne(
      { _id: lapsed.order._id },
      { $set: { warrantyUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    );

    res = await fetch(`${base}/api/orders/${lapsed.order._id}`, { headers: buyerHeaders });
    body = await res.json();
    assert(
      body.data.order.canRequestCancellation === false && /warranty/i.test(body.data.order.cancelBlockedReason),
      'an expired warranty reports the cancel action as unavailable, with a reason'
    );
    assert(
      body.data.order.status === 'delivered' && new Date(body.data.order.expiresAt) > new Date(),
      'the order is still delivered and still valid — only the warranty lapsed'
    );

    res = await fetch(`${base}/api/orders/${lapsed.order._id}/cancel-request`, {
      method: 'POST',
      headers: buyerHeaders,
    });
    body = await res.json();
    assert(res.status === 400, 'the server refuses a cancellation once the warranty has ended');
    assert(/warranty/i.test(body.message), 'the refusal explains that the warranty ended');

    // No warranty configured at all -> unrestricted, which is what pre-existing orders get.
    const uncovered = await orderFor('edit-key-none', 0);
    assert(uncovered.delivered.warrantyUntil === null, 'no warranty days means no warranty deadline is stamped');
    assert(
      uncovered.delivered.canRequestCancellation === true,
      'an order with no warranty window keeps cancellation open'
    );

    // --- upload signing lives where the client asks for it ----------------------------
    console.log('\n  Admin upload endpoints');
    // Admin signing moved to /admin/uploads/* (requireAuth on the public router accepts only
    // site-scoped tokens). The client kept calling the old public paths, so every admin upload
    // 404'd — choosing a product image did nothing, and neither did attaching a credential
    // file. These assert the endpoints the client actually calls are the ones that exist.
    for (const kind of ['product-image', 'ad-image', 'payment-qr', 'credential-file']) {
      res = await fetch(`${base}/api/admin/uploads/sign/${kind}`, { method: 'POST', headers: adminHeaders, body: '{}' });
      // 200 when Cloudinary is configured, 501 when it isn't — both prove the route exists and
      // the admin session is accepted. A 404 is the regression this guards against.
      assert(res.status !== 404, `POST /admin/uploads/sign/${kind} exists for an admin session`);
    }
    res = await fetch(`${base}/api/uploads/sign/product-image`, { method: 'POST', headers: adminHeaders, body: '{}' });
    assert(res.status === 404, 'the old public product-image signing path is gone (clients must use /admin/uploads)');

    res = await fetch(`${base}/api/admin/uploads/import-url`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://cdn.test/some-image.png' }),
    });
    assert(res.status !== 404, 'POST /admin/uploads/import-url exists (pasted URLs are imported into Cloudinary)');

    // --- payment methods carry their QR ------------------------------------------------
    console.log('\n  Payment method QR');
    res = await fetch(`${base}/api/admin/payment-methods`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'JazzCash',
        type: 'mobile_wallet',
        accountTitle: 'Accvendor',
        accountNumber: '0300-1111111',
        instructions: 'Scan or send to the number above.',
        qrImageUrl: 'https://cdn.test/jazzcash-qr.png',
        qrImagePublicId: 'accvendor/payment-qr/one',
      }),
    });
    body = await res.json();
    assert(res.status === 201 && body.data.paymentMethod.qrImageUrl.includes('jazzcash-qr'), 'admin saves a QR on a payment method');
    const pmId = body.data.paymentMethod._id;

    res = await fetch(`${base}/api/payment-methods`);
    body = await res.json();
    const publicPm = body.data.paymentMethods.find((m) => String(m._id) === String(pmId));
    assert(
      publicPm && publicPm.qrImageUrl.includes('jazzcash-qr') && publicPm.instructions.length > 0,
      'the buyer-facing payment method list carries the QR and the instructions'
    );

    // Clearing the QR must be possible, and must not trip the URL validator on an empty string.
    res = await fetch(`${base}/api/admin/payment-methods/${pmId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ qrImageUrl: null, qrImagePublicId: null }),
    });
    body = await res.json();
    assert(res.status === 200 && body.data.paymentMethod.qrImageUrl === null, 'admin can clear a QR');

    // --- serialization regressions ----------------------------------------------------
    console.log('\n  Order payload shape');
    res = await fetch(`${base}/api/orders`, { headers: buyerHeaders });
    body = await res.json();
    const listed = body.data.orders.find((o) => String(o._id) === String(covered.order._id));
    assert(
      listed && listed.cancelRequested === true,
      'the lean order list still reports cancelRequested (the virtual it used to drop)'
    );
    assert(listed.cancelRequestStatus === 'pending', 'the order list exposes the cancel request status');
  } finally {
    server.close();
    const { disconnectDB } = require('../src/config/db');
    await disconnectDB();
    await mem.stop();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
