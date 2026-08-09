/**
 * Forward migration for the multi-currency / order-number / notification schema change.
 *
 * Idempotent: every step only touches documents that still hold the old shape, so running it
 * twice is a no-op. Run it once against each environment *before* starting the new server —
 * Order.orderNumber is required and uniquely indexed, so pre-existing orders cannot be saved
 * until they have one.
 *
 *   node src/seed/migrate.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Product = require('../models/Product');
const { Order } = require('../models/Order');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { generateOrderNumber } = require('../utils/orderNumber');

async function migrateProducts() {
  // `media` mirrors `images` but carries the Cloudinary publicId. Existing products only have
  // the URL, so publicId stays null — those assets simply aren't owned/destroyable by us.
  const cursor = Product.find({
    $or: [{ media: { $exists: false } }, { media: { $size: 0 } }],
    images: { $exists: true, $ne: [] },
  }).cursor();

  let count = 0;
  for await (const product of cursor) {
    product.media = (product.images || []).map((url) => ({ url, publicId: null }));
    await product.save();
    count += 1;
  }
  return count;
}

async function migrateOrders() {
  const stats = { numbered: 0, currency: 0, cancel: 0, contact: 0 };

  // 1. Order numbers. Generated one at a time with a uniqueness probe rather than in bulk,
  //    because the unique index doesn't exist yet on a collection that has never had one.
  const unnumbered = Order.find({ $or: [{ orderNumber: { $exists: false } }, { orderNumber: null }] })
    .select('_id')
    .cursor();
  for await (const { _id } of unnumbered) {
    let orderNumber;
    do {
      orderNumber = generateOrderNumber();
      // eslint-disable-next-line no-await-in-loop
    } while (await Order.exists({ orderNumber }));
    await Order.updateOne({ _id }, { $set: { orderNumber } });
    stats.numbered += 1;
  }

  // 2. Currency snapshot. Every historical order was priced in PKR, so the stored amounts are
  //    already the base amounts — the PKR mirrors are a straight copy, not a conversion.
  const uncurrenced = Order.find({ $or: [{ currency: { $exists: false } }, { totalPKR: null }] }).cursor();
  for await (const order of uncurrenced) {
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          currency: order.currency || 'PKR',
          subtotalPKR: order.subtotalPKR ?? order.subtotal,
          discountPKR: order.discountPKR ?? order.discount ?? 0,
          totalPKR: order.totalPKR ?? order.total,
          items: (order.items || []).map((item) => ({
            ...(item.toObject ? item.toObject() : item),
            unitPricePKR: item.unitPricePKR ?? item.unitPrice,
          })),
        },
      }
    );
    stats.currency += 1;
  }

  // 3. cancelRequested boolean -> cancelRequest sub-document. A previously *rejected* request
  //    used to reset the boolean to false, which let the customer re-request; those orders map
  //    to a terminal 'rejected' so the one-request-per-order rule holds retroactively.
  const raw = mongoose.connection.collection('orders');
  const legacyCancels = raw.find({ cancelRequest: { $exists: false } });
  for await (const doc of legacyCancels) {
    const wasPending = doc.cancelRequested === true;
    const wasRejected = !wasPending && Boolean(doc.cancelRejectionReason);
    await raw.updateOne(
      { _id: doc._id },
      {
        $set: {
          cancelRequest: {
            status: wasPending ? 'pending' : wasRejected ? 'rejected' : 'none',
            reason: null,
            requestedAt: wasPending || wasRejected ? doc.updatedAt || doc.createdAt || null : null,
            decidedAt: wasRejected ? doc.updatedAt || null : null,
            decidedBy: null,
            rejectionReason: doc.cancelRejectionReason || null,
          },
        },
        $unset: { cancelRequested: '', cancelRejectionReason: '' },
      }
    );
    stats.cancel += 1;
  }

  // 4. Denormalised buyer contact, so admin order search can match email/name without a join.
  const missingContact = Order.find({ $or: [{ userEmail: { $exists: false } }, { userEmail: null }] })
    .select('_id user')
    .cursor();
  for await (const order of missingContact) {
    const user = await User.findById(order.user).select('email name').lean();
    if (!user) continue;
    await Order.updateOne({ _id: order._id }, { $set: { userEmail: user.email, userName: user.name } });
    stats.contact += 1;
  }

  return stats;
}

async function migrateSettings() {
  // Read the *raw* document, not a hydrated one. Mongoose fills schema defaults in memory on
  // hydration, so a hydrated read reports every new field as already present and this step
  // would silently do nothing — while `getSettings()`, which reads with `.lean()`, keeps
  // returning `undefined` for fields the document has never actually stored. Defaults are
  // only ever written on insert, so an existing singleton needs them backfilled explicitly.
  const raw = mongoose.connection.collection('settings');
  const settings = await raw.findOne({ singleton: 'main' });
  if (!settings) return false;

  const $set = {};
  if (settings.defaultCurrency === undefined) $set.defaultCurrency = 'USD';
  if (settings.footer === undefined) {
    $set.footer = { copyrightYear: '2024', creditName: 'Bano Digital Hub', creditUrl: 'https://www.banodigitalhub.pk' };
  }
  if (settings.trust === undefined) {
    $set.trust = { ratingProviders: [], badges: [], stats: [], testimonials: [], reviewsHeading: '', allReviewsUrl: '' };
  }

  if (Object.keys($set).length === 0) return false;
  await raw.updateOne({ _id: settings._id }, { $set });
  return true;
}

async function run() {
  await connectDB();
  console.log('[migrate] starting');

  const products = await migrateProducts();
  console.log(`[migrate] products: ${products} backfilled with media[]`);

  const orders = await migrateOrders();
  console.log(
    `[migrate] orders: ${orders.numbered} numbered, ${orders.currency} currency-stamped, ` +
      `${orders.cancel} cancel requests converted, ${orders.contact} contacts denormalised`
  );

  const settings = await migrateSettings();
  console.log(`[migrate] settings: ${settings ? 'updated' : 'already current'}`);

  // Build the new indexes (including the unique one on orderNumber) now that every document
  // satisfies them. syncIndexes also drops indexes the schemas no longer declare.
  for (const model of [Product, Order, Settings]) {
    await model.syncIndexes();
  }
  console.log('[migrate] indexes synced');

  await disconnectDB();
  console.log('[migrate] done');
}

run().catch(async (err) => {
  console.error('[migrate] failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
