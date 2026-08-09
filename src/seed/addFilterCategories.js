require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Category = require('../models/Category');

const CATEGORIES = [
  { name: 'Subscription', slug: 'subscription-tier', description: 'General subscription products' },
  { name: 'Engagement', slug: 'engagement', description: 'Engagement and growth service products' },
];

async function run() {
  await connectDB();
  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ slug: cat.slug });
    if (existing) {
      console.log(`[filter-categories] "${cat.slug}" already exists — skipping`);
      continue;
    }
    await Category.create({
      ...cat,
      image: `https://placehold.co/600x400/1f2937/ffffff?text=${encodeURIComponent(cat.name)}`,
      isActive: true,
    });
    console.log(`[filter-categories] created "${cat.name}"`);
  }
  console.log('[filter-categories] done');
  await disconnectDB();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error('[filter-categories] failed:', err);
  process.exit(1);
});
