require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');

function nameFromEmail(email) {
  const local = email.split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function run() {
  await connectDB();

  const users = await User.find({ $or: [{ name: { $exists: false } }, { name: null }, { name: '' }] });
  for (const user of users) {
    user.name = nameFromEmail(user.email);
    await user.save();
    console.log(`[backfill] set name "${user.name}" for ${user.email}`);
  }
  console.log(`[backfill] done — updated ${users.length} user(s)`);

  await disconnectDB();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
