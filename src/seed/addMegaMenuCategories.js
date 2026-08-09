require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Category = require('../models/Category');

// Additive only — never touches existing categories (e.g. "software" already exists).
const CATEGORIES = [
  { name: 'SVOD', slug: 'svod', description: 'Streaming video-on-demand subscriptions' },
  { name: 'AI', slug: 'ai', description: 'AI tools and assistant subscriptions' },
  { name: 'Music', slug: 'music', description: 'Music streaming subscriptions' },
  { name: 'Marketplace', slug: 'marketplace', description: 'Popular apps and services marketplace' },
];

async function run() {
  await connectDB();

  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ slug: cat.slug });
    if (existing) {
      console.log(`[mega-menu-categories] "${cat.slug}" already exists — skipping`);
      continue;
    }
    await Category.create({
      ...cat,
      image: `https://placehold.co/600x400/1f2937/ffffff?text=${encodeURIComponent(cat.name)}`,
      isActive: true,
    });
    console.log(`[mega-menu-categories] created "${cat.name}"`);
  }

  console.log('[mega-menu-categories] done');
  await disconnectDB();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error('[mega-menu-categories] failed:', err);
  process.exit(1);
});
