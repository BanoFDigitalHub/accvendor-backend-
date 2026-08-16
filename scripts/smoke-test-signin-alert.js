/**
 * A successful sign-in tells the account owner about it.
 *
 * The point of the notice is that a sign-in the owner did not perform reaches them while the
 * session is still young enough to be worth killing, so the assertions are about *when* it is
 * sent as much as that it is:
 *
 *  - a correct password sends it; a wrong one does not (a failed attempt is not a sign-in, and
 *    alerting on every typo trains people to ignore the alert),
 *  - Google sign-in sends it too, and says so — "Password" vs "Google" is often the whole tell,
 *  - creating an account via Google does not, because the person is looking at the screen that
 *    just made it,
 *  - the admin panel does not, so the one operator is not alerted about their own logins,
 *  - and the send never blocks or fails the login: a dead mailbox must not cost anyone their
 *    session.
 */
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.CREDENTIAL_URL_SECRET = 'test_credential_secret';
process.env.TOTP_SHARE_SECRET = 'test_totp_share_secret';
process.env.BCRYPT_SALT_ROUNDS = '4';

const { MongoMemoryServer } = require('mongodb-memory-server');

let pass = 0;
let fail = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ FAILED: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const flush = () => new Promise((r) => setImmediate(r));

async function run() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('accvendor_signin_alert_test');
  process.env.MONGODB_DB_NAME = 'accvendor_signin_alert_test';

  // Stubbed before auth.service destructures it.
  const emailService = require('../src/services/email.service');
  const sent = [];
  emailService.sendMail = async (msg) => {
    sent.push(msg);
    return true;
  };

  // auth.service destructures `verifyIdToken` off google.service at require time, so the stub has
  // to be installed first and has to stay the same function object — hence the swappable holder
  // rather than reassigning the export later.
  const googleService = require('../src/services/google.service');
  let googleProfile = null;
  googleService.verifyIdToken = async () => {
    if (!googleProfile) throw new Error('no google profile staged');
    return googleProfile;
  };

  const { connectDB, disconnectDB } = require('../src/config/db');
  await connectDB();
  const bcrypt = require('bcryptjs');
  const User = require('../src/models/User');
  const authService = require('../src/services/auth.service');

  const META = { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (Macintosh) TestRunner/1.0' };
  const alerts = () => sent.filter((m) => /new sign-in/i.test(m.subject || ''));

  try {
    await User.create({
      name: 'Buyer',
      email: 'buyer@example.com',
      passwordHash: await bcrypt.hash('CorrectHorse1', 4),
      securityQuestion: 'First pet?',
      securityAnswerHash: await bcrypt.hash('rex', 4),
      isVerified: true,
    });

    console.log('\n  Password sign-in');
    sent.length = 0;
    await authService.login({ email: 'buyer@example.com', password: 'CorrectHorse1' }, META);
    await flush();
    assert(alerts().length === 1, 'a successful login sends exactly one notification');

    const mail = alerts()[0];
    assert(mail.to === 'buyer@example.com', 'it goes to the account owner');
    assert(/Password/.test(mail.html), 'it names the method used');
    assert(mail.html.includes(META.ip), 'it carries the IP the request came from');
    assert(mail.html.includes('TestRunner/1.0'), 'and the device that made it');
    assert(/UTC/.test(mail.html), 'the time is stated in UTC, not the server locale');

    console.log('\n  A failed attempt is not a sign-in');
    sent.length = 0;
    await authService.login({ email: 'buyer@example.com', password: 'wrong-password' }, META).catch(() => {});
    await flush();
    assert(alerts().length === 0, 'a wrong password sends nothing');

    console.log('\n  Google sign-in');
    googleProfile = { googleId: 'g-123', email: 'buyer@example.com', name: 'Buyer', avatarUrl: null };

    sent.length = 0;
    await authService.loginWithGoogle({ credential: 'x'.repeat(40) }, META);
    await flush();
    assert(alerts().length === 1, 'linking an existing account through Google notifies them');
    assert(/Google/.test(alerts()[0].html), 'and the notice says it was Google, not a password');

    googleProfile = { googleId: 'g-999', email: 'brand-new@example.com', name: 'New Person', avatarUrl: null };
    sent.length = 0;
    await authService.loginWithGoogle({ credential: 'y'.repeat(40) }, META);
    await flush();
    assert(alerts().length === 0, 'creating an account through Google does NOT send a sign-in alert');

    console.log('\n  The admin panel is exempt');
    await User.create({
      name: 'Boss',
      email: 'boss@example.com',
      passwordHash: await bcrypt.hash('AdminPass1', 4),
      securityQuestion: 'First pet?',
      securityAnswerHash: await bcrypt.hash('rex', 4),
      isVerified: true,
      role: 'admin',
    });
    sent.length = 0;
    await authService.login({ email: 'boss@example.com', password: 'AdminPass1' }, META, 'admin');
    await flush();
    assert(alerts().length === 0, 'an admin-scoped login sends no alert');

    console.log('\n  A broken mailbox never costs anyone their session');
    emailService.sendMail = async () => {
      throw new Error('mailbox on fire');
    };
    const result = await authService.login({ email: 'buyer@example.com', password: 'CorrectHorse1' }, META);
    await flush();
    assert(Boolean(result?.tokens?.accessToken), 'the login still succeeds when the send throws');
  } finally {
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
