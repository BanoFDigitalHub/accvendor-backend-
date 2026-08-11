/**
 * Reviews whose product no longer exists.
 *
 * Such a row is invisible everywhere by design — the public list resolves a slug to a product
 * and queries by its id, so a review pointing at a deleted product can never be rendered no
 * matter how many times it is approved. That is what made "the admin approves it and nothing
 * shows up" look like a display bug. Deleting a product now takes its reviews with it
 * (`admin/catalog.service.js`), so this only ever finds rows that predate that.
 *
 *   node scripts/prune-orphan-reviews.js            # report only
 *   node scripts/prune-orphan-reviews.js --delete   # actually remove them
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const { Review } = require('../src/models/Review');
const Product = require('../src/models/Product');

async function run() {
  const doDelete = process.argv.includes('--delete');
  await connectDB();

  const reviews = await Review.find().select('product status rating createdAt').lean();
  const productIds = [...new Set(reviews.map((r) => String(r.product)))];
  const alive = new Set(
    (await Product.find({ _id: { $in: productIds } }).select('_id').lean()).map((p) => String(p._id))
  );

  const orphans = reviews.filter((r) => !alive.has(String(r.product)));

  console.log(`\n  ${reviews.length} review(s) total, ${orphans.length} pointing at a deleted product.`);
  for (const r of orphans) {
    console.log(`    ${r._id}  ${r.status.padEnd(8)} ${r.rating}★  product ${r.product} (gone)`);
  }

  if (orphans.length === 0) {
    console.log('\n  Nothing to prune.\n');
  } else if (!doDelete) {
    console.log('\n  Dry run — re-run with --delete to remove them.\n');
  } else {
    const { deletedCount } = await Review.deleteMany({ _id: { $in: orphans.map((r) => r._id) } });
    console.log(`\n  Deleted ${deletedCount} orphaned review(s).\n`);
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(`\n  ${err.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
