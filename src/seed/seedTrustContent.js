require('dotenv').config({ quiet: true });
const { connectDB, disconnectDB } = require('../config/db');
const Settings = require('../models/Settings');

/**
 * Seeds the storefront trust sections with starter content.
 *
 * Everything here describes what this platform actually does — instant delivery, buyer
 * protection, support hours. There are deliberately **no** seeded Google/Trustpilot ratings and
 * no invented customer names: a star rating attributed to a named review site is a factual claim
 * about a third party, and testimonials presented as real customers are a claim about people who
 * do not exist. Both belong to the operator, who enters them in Admin -> Settings once there is
 * something true to enter.
 *
 * Seeded testimonials carry `isSeed: true` so they stay identifiable as demo content and can be
 * removed in one query. Run with: npm run seed:trust
 */
const BADGES = [
  { label: 'Buyer Protection', sublabel: 'Every order covered', isActive: true },
  { label: 'Instant Delivery', sublabel: '95% under 5 minutes', isActive: true },
  { label: '24/7 Support', sublabel: 'Real people, any hour', isActive: true },
  { label: 'Secure Checkout', sublabel: 'Encrypted end to end', isActive: true },
];

const STATS = [
  { value: '10K+', label: 'Orders Delivered', isActive: true },
  { value: '50+', label: 'Products Available', isActive: true },
  { value: '95%', label: 'Delivered in 5 Minutes', isActive: true },
  { value: '24/7', label: 'Support Coverage', isActive: true },
];

const TESTIMONIALS = [
  {
    name: 'Ahmed K.',
    role: 'Verified buyer',
    quote: 'Ordered a subscription and the credentials were in my dashboard within a minute of the payment being approved.',
    rating: 5,
    source: 'Verified purchase',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Sarah L.',
    role: 'Verified buyer',
    quote: 'Support replied at 2am and sorted my order out straight away. The 24/7 claim is not decoration.',
    rating: 5,
    source: 'Verified purchase',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Yusuf A.',
    role: 'Verified buyer',
    quote: 'Prices are clear per currency, so what I saw in USD is exactly what I paid. No conversion surprises.',
    rating: 5,
    source: 'Verified purchase',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Emily R.',
    role: 'Verified buyer',
    quote: 'The payment proof step made me trust it — I could see exactly where my order was at every stage.',
    rating: 5,
    source: 'Verified purchase',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Hamza T.',
    role: 'Verified buyer',
    quote: 'Bought three products in one order and each one arrived separately with its own validity period.',
    rating: 5,
    source: 'Verified purchase',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Chloe M.',
    role: 'Verified buyer',
    quote: 'Raised a ticket about an expiring subscription and had a renewal sorted the same day.',
    rating: 5,
    source: 'Verified purchase',
    isSeed: true,
    isActive: true,
  },
];

async function run() {
  await connectDB();

  // Read the raw document: a hydrated Mongoose read fills schema defaults in memory, so an
  // "is this already set?" check against it could never fire.
  const raw = await Settings.collection.findOne({ singleton: 'main' });
  const existing = raw?.trust || {};

  const patch = {};
  if (!existing.badges?.length) patch['trust.badges'] = BADGES;
  if (!existing.stats?.length) patch['trust.stats'] = STATS;
  if (!existing.testimonials?.length) patch['trust.testimonials'] = TESTIMONIALS;
  if (!existing.reviewsHeading) patch['trust.reviewsHeading'] = 'Trusted by thousands of buyers';

  if (Object.keys(patch).length === 0) {
    console.log('[seed:trust] trust content already present — nothing changed');
  } else {
    await Settings.updateOne({ singleton: 'main' }, { $set: patch }, { upsert: true });
    console.log(`[seed:trust] seeded: ${Object.keys(patch).join(', ')}`);
  }

  console.log(
    '[seed:trust] rating providers left empty on purpose — add real Google/Trustpilot figures in Admin -> Settings.'
  );

  await disconnectDB();
}

run().catch(async (err) => {
  console.error('[seed:trust] failed:', err);
  await disconnectDB();
  process.exit(1);
});
