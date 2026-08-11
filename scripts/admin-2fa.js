/**
 * Admin 2FA recovery — run on the server, against the real database.
 *
 * Admin TOTP has no emailed reset path and no recovery codes: `disableTwoFactor` requires a
 * valid code, which is exactly what an admin who lost their authenticator does not have. The
 * secret itself is stored on the user row, so console access is the recovery route.
 *
 *   node scripts/admin-2fa.js status              # who has 2FA on
 *   node scripts/admin-2fa.js show <email>        # secret + otpauth URI + a live code
 *   node scripts/admin-2fa.js disable <email>     # turn 2FA off so login is password-only
 *
 * `show` is the one to reach for: re-add the key to an authenticator and nothing about the
 * account changes. `disable` is the fallback when the key is to be abandoned — set 2FA up again
 * from the panel afterwards.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { authenticator } = require('otplib');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');

const ISSUER = 'Accvendor Admin';

function otpauthUri(email, secret) {
  const params = new URLSearchParams({ secret, issuer: ISSUER, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?${params.toString()}`;
}

async function run() {
  const [action, email] = process.argv.slice(2);

  if (!action || !['status', 'show', 'disable'].includes(action)) {
    console.log('Usage: node scripts/admin-2fa.js <status|show|disable> [email]');
    process.exit(1);
  }
  if (action !== 'status' && !email) {
    console.log(`Usage: node scripts/admin-2fa.js ${action} <email>`);
    process.exit(1);
  }

  await connectDB();

  if (action === 'status') {
    const admins = await User.find({ role: 'admin' }).select('email totpEnabled').lean();
    if (admins.length === 0) console.log('No admin users found.');
    for (const a of admins) {
      console.log(`  ${a.email.padEnd(34)} 2FA ${a.totpEnabled ? 'ON' : 'off'}`);
    }
  } else {
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('email role totpEnabled totpSecret');
    if (!user) throw new Error(`No user with email ${email}`);
    if (user.role !== 'admin') throw new Error(`${email} is not an admin account`);

    if (action === 'show') {
      if (!user.totpSecret) {
        console.log(`${user.email} has no 2FA secret stored — log in with the password alone.`);
      } else {
        console.log(`\n  Account       ${user.email}`);
        console.log(`  2FA           ${user.totpEnabled ? 'enabled' : 'set up but not confirmed'}`);
        console.log(`\n  SECRET KEY    ${user.totpSecret}`);
        console.log(`  Current code  ${authenticator.generate(user.totpSecret)}  (changes every 30s)`);
        console.log(`\n  otpauth URI   ${otpauthUri(user.email, user.totpSecret)}\n`);
        console.log('  Add the secret key to any authenticator app, or paste it into the site\'s');
        console.log('  own 2FA tool at /tools/2fa, then log in with the code it shows.\n');
      }
    } else {
      user.totpSecret = null;
      user.totpEnabled = false;
      await user.save();
      console.log(`2FA disabled for ${user.email}. Log in with the password alone, then set it up again from Security.`);
    }
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(`\n  ${err.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
