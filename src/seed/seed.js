require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { env } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const PaymentMethod = require('../models/PaymentMethod');
const Coupon = require('../models/Coupon');

const placeholderImage = (label) =>
  `https://placehold.co/600x400/1f2937/ffffff?text=${encodeURIComponent(label)}`;

const CATEGORIES = [
  { name: 'Streaming', slug: 'streaming', description: 'Movie, TV, and music streaming subscriptions' },
  { name: 'Gaming', slug: 'gaming', description: 'Game subscriptions, credits, and passes' },
  { name: 'Software', slug: 'software', description: 'Productivity and creative software licenses' },
  { name: 'VPN & Security', slug: 'vpn-security', description: 'VPN and online security subscriptions' },
  { name: 'Education', slug: 'education', description: 'Online learning platform subscriptions' },
  { name: 'Productivity', slug: 'productivity', description: 'Design and productivity tools' },
];

const PRODUCTS = [
  {
    name: 'Netflix Premium — 1 Month',
    slug: 'netflix-premium-1-month',
    category: 'streaming',
    description: '4K Ultra HD streaming on up to 4 screens simultaneously, full catalog access.',
    price: 500,
    salePrice: 450,
    durationDays: 30,
    stock: 20,
    isHotProduct: true,
  },
  {
    name: 'Spotify Premium — 3 Months',
    slug: 'spotify-premium-3-months',
    category: 'streaming',
    description: 'Ad-free music streaming with offline downloads for 3 months.',
    price: 900,
    salePrice: null,
    durationDays: 90,
    stock: 15,
  },
  {
    name: 'YouTube Premium — 1 Month',
    slug: 'youtube-premium-1-month',
    category: 'streaming',
    description: 'Ad-free YouTube, background play, and YouTube Music included.',
    price: 300,
    salePrice: null,
    durationDays: 30,
    stock: 0,
  },
  {
    name: 'Xbox Game Pass Ultimate — 1 Month',
    slug: 'xbox-game-pass-ultimate-1-month',
    category: 'gaming',
    description: 'Access to a huge library of console and PC games, plus Xbox Live Gold.',
    price: 1200,
    salePrice: 999,
    durationDays: 30,
    stock: 10,
    isHotProduct: true,
  },
  {
    name: 'Steam Wallet Code — $20',
    slug: 'steam-wallet-code-20',
    category: 'gaming',
    description: 'A $20 Steam wallet top-up code, redeemable on any Steam account.',
    price: 6500,
    salePrice: null,
    durationDays: 3650,
    stock: 25,
  },
  {
    name: 'Microsoft Office 365 — 1 Year',
    slug: 'microsoft-office-365-1-year',
    category: 'software',
    description: 'Full Office suite (Word, Excel, PowerPoint, Outlook) plus 1TB OneDrive storage.',
    price: 3500,
    salePrice: null,
    durationDays: 365,
    stock: 12,
  },
  {
    name: 'Adobe Creative Cloud — 1 Month',
    slug: 'adobe-creative-cloud-1-month',
    category: 'software',
    description: 'Full access to Photoshop, Illustrator, Premiere Pro, and the rest of the CC suite.',
    price: 2800,
    salePrice: null,
    durationDays: 30,
    stock: 5,
  },
  {
    name: 'NordVPN — 1 Year',
    slug: 'nordvpn-1-year',
    category: 'vpn-security',
    description: 'Secure, high-speed VPN with servers in 60+ countries and a strict no-logs policy.',
    price: 4200,
    salePrice: 3500,
    durationDays: 365,
    stock: 30,
    isHotProduct: true,
  },
  {
    name: 'Coursera Plus — 1 Month',
    slug: 'coursera-plus-1-month',
    category: 'education',
    description: 'Unlimited access to 7,000+ courses, certificates, and specializations.',
    price: 2200,
    salePrice: null,
    durationDays: 30,
    stock: 8,
  },
  {
    name: 'Canva Pro — 1 Year',
    slug: 'canva-pro-1-year',
    category: 'productivity',
    description: 'Premium templates, background remover, and brand kit tools for a full year.',
    price: 1800,
    salePrice: null,
    durationDays: 365,
    stock: 18,
  },
];

async function seedAdmin() {
  const existing = await User.findOne({ email: env.seedAdminEmail });
  if (existing) {
    console.log(`[seed] admin already exists: ${env.seedAdminEmail}`);
    return;
  }

  const passwordHash = await bcrypt.hash(env.seedAdminPassword, env.bcryptSaltRounds);
  const securityAnswerHash = await bcrypt.hash('blue', env.bcryptSaltRounds);

  await User.create({
    email: env.seedAdminEmail,
    passwordHash,
    securityQuestion: 'What city were you born in?',
    securityAnswerHash,
    role: 'admin',
    isVerified: true,
  });

  console.log(`[seed] created admin: ${env.seedAdminEmail} / ${env.seedAdminPassword}`);
  console.log('[seed] change this password after first login.');
}

async function seedCategoriesAndProducts() {
  const slugToId = {};

  for (const cat of CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { slug: cat.slug },
      { $setOnInsert: { ...cat, image: placeholderImage(cat.name), isActive: true } },
      { upsert: true, returnDocument: 'after' }
    );
    slugToId[cat.slug] = doc._id;
  }
  console.log(`[seed] categories ready: ${CATEGORIES.length}`);

  let created = 0;
  for (const p of PRODUCTS) {
    const existing = await Product.findOne({ slug: p.slug });
    if (existing) continue;
    await Product.create({
      name: p.name,
      slug: p.slug,
      description: p.description,
      images: [placeholderImage(p.name)],
      category: slugToId[p.category],
      price: p.price,
      salePrice: p.salePrice,
      durationDays: p.durationDays,
      stock: p.stock,
      isHotProduct: Boolean(p.isHotProduct),
      isActive: true,
    });
    created += 1;
  }
  console.log(`[seed] products created: ${created} (of ${PRODUCTS.length} total defined)`);
}

const PAYMENT_METHODS = [
  {
    name: 'JazzCash',
    type: 'mobile_wallet',
    accountTitle: 'Accvendor Store',
    accountNumber: '0300-1234567',
    instructions: 'Send payment and upload a screenshot of the transaction as proof.',
    sortOrder: 1,
  },
  {
    name: 'Easypaisa',
    type: 'mobile_wallet',
    accountTitle: 'Accvendor Store',
    accountNumber: '0345-7654321',
    instructions: 'Send payment and upload a screenshot of the transaction as proof.',
    sortOrder: 2,
  },
  {
    name: 'Bank Transfer',
    type: 'bank',
    accountTitle: 'Accvendor Pvt Ltd',
    accountNumber: 'PK00 ABCD 0000 1234 5678 9012',
    instructions: 'Transfer to the account above and upload your bank receipt as proof.',
    sortOrder: 3,
  },
  {
    name: 'Binance Pay',
    type: 'crypto',
    accountTitle: 'Accvendor',
    accountNumber: 'Binance ID: 123456789',
    instructions: 'Send USDT (BEP20) to the Binance Pay ID above and upload a screenshot as proof.',
    sortOrder: 4,
  },
];

async function seedPaymentMethods() {
  let created = 0;
  for (const pm of PAYMENT_METHODS) {
    const existing = await PaymentMethod.findOne({ name: pm.name });
    if (existing) continue;
    await PaymentMethod.create({ ...pm, isActive: true });
    created += 1;
  }
  console.log(`[seed] payment methods created: ${created} (of ${PAYMENT_METHODS.length} total defined)`);
}

async function seedCoupon() {
  const existing = await Coupon.findOne({ code: 'WELCOME10' });
  if (existing) {
    console.log('[seed] coupon already exists: WELCOME10');
    return;
  }
  await Coupon.create({
    code: 'WELCOME10',
    type: 'percentage',
    value: 10,
    minOrderAmount: 0,
    usageLimit: null,
    perUserLimit: 1,
    expiresAt: null,
    applicableProducts: [],
    isActive: true,
  });
  console.log('[seed] created coupon: WELCOME10 (10% off, one use per user)');
}

async function run() {
  await connectDB();
  await seedAdmin();
  await seedCategoriesAndProducts();
  await seedPaymentMethods();
  await seedCoupon();
  await disconnectDB();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
