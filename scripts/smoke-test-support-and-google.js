process.env.NODE_ENV='test'; process.env.CLIENT_URL='http://localhost:3000'; process.env.SITE_URL='https://accvendor.vercel.app';
process.env.JWT_ACCESS_SECRET='a'; process.env.JWT_REFRESH_SECRET='b'; process.env.CREDENTIAL_URL_SECRET='c'; process.env.TOTP_SHARE_SECRET='d';

/**
 * Two rules that are cheap to break and expensive to notice:
 *
 *  1. **One live support ticket per customer.** Enforced in supportTicket.service#createTicket
 *     and mirrored by the /support/tickets/open endpoint the form reads. If this regresses, the
 *     symptom is not an error — it is the admin desk quietly filling with four copies of the
 *     same complaint, each with its own notification.
 *
 *  2. **A Google account has no password, and nothing may assume it does.** `passwordHash` is
 *     conditionally required now, so every password path has to survive meeting a row that has
 *     none. The failure mode there is a 500 from `bcrypt.compare(x, undefined)` — which rejects
 *     rather than returning false — on a login screen.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
let fail = 0;
const ok = (c, l) => { console.log(`  ${c ? '✓' : '✗ FAILED:'} ${l}`); if (!c) fail++; };

/** Runs `fn`, returning the ApiError it threw (or null if it unexpectedly succeeded). */
async function throws(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('support_google_test');
  process.env.MONGODB_DB_NAME = 'support_google_test';
  const { connectDB } = require('../src/config/db'); await connectDB();
  const mongoose = require('mongoose');
  const User = require('../src/models/User');
  const { SupportTicket } = require('../src/models/SupportTicket');
  const tickets = require('../src/services/supportTicket.service');
  const auth = require('../src/services/auth.service');

  const buyer = await User.create({
    email: 'buyer@x.com', name: 'Buyer', passwordHash: 'x',
    securityQuestion: 'q', securityAnswerHash: 'x', isVerified: true,
  });
  const other = await User.create({
    email: 'other@x.com', name: 'Other', passwordHash: 'x',
    securityQuestion: 'q', securityAnswerHash: 'x', isVerified: true,
  });
  const admin = await User.create({
    email: 'admin@x.com', name: 'Admin', passwordHash: 'x',
    securityQuestion: 'q', securityAnswerHash: 'x', role: 'admin',
  });

  console.log('\n  One live ticket per customer');

  ok(await tickets.findLiveTicket(buyer._id) === null, 'a customer with no tickets has no live one');

  const first = await tickets.createTicket(buyer._id, { subject: 'Netflix not delivered', body: 'Where is it?' });
  ok(Boolean(first?._id), 'the first ticket is created');

  const second = await throws(() => tickets.createTicket(buyer._id, { subject: 'Same thing again', body: 'Hello?' }));
  ok(second?.statusCode === 409, 'a second ticket is refused with 409');
  ok(second?.details?.code === 'TICKET_ALREADY_OPEN', 'the refusal carries TICKET_ALREADY_OPEN');
  ok(second?.details?.ticketId === String(first._id), 'it points at the ticket they already have');
  ok(await SupportTicket.countDocuments({ user: buyer._id }) === 1, 'no second row was written');

  // The rule is per customer, not global — the obvious way to get this wrong.
  const othersTicket = await tickets.createTicket(other._id, { subject: 'Different person', body: 'Hi' });
  ok(Boolean(othersTicket?._id), 'a different customer is unaffected');

  // 'answered' is still live: support has replied and is waiting on them, which is exactly when
  // an impatient customer files a duplicate.
  await tickets.adminReply(admin._id, first._id, { body: 'Looking into it' });
  ok((await tickets.findLiveTicket(buyer._id))?.status === 'answered', 'an answered ticket is still live');
  const third = await throws(() => tickets.createTicket(buyer._id, { subject: 'Third', body: 'x' }));
  ok(third?.statusCode === 409, 'no new ticket while one is merely answered');

  await tickets.adminCloseTicket(first._id);
  ok(await tickets.findLiveTicket(buyer._id) === null, 'closing it clears the way');
  const fourth = await tickets.createTicket(buyer._id, { subject: 'New problem', body: 'y' });
  ok(Boolean(fourth?._id), 'a new ticket is allowed once the old one is closed');

  // Blocked-account appeals go through a separate, session-less endpoint — the easiest one to
  // spam, so it obeys the same rule.
  const blocked = await User.create({
    email: 'blocked@x.com', name: 'Blocked', passwordHash: 'x',
    securityQuestion: 'q', securityAnswerHash: 'x', isBlocked: true, blockReason: 'Chargeback',
  });
  await tickets.createBlockAppeal({ email: 'blocked@x.com', message: 'Please review' });
  const appealAgain = await throws(() => tickets.createBlockAppeal({ email: 'blocked@x.com', message: 'Again' }));
  ok(appealAgain?.statusCode === 409, 'a second block appeal is refused too');
  ok(await SupportTicket.countDocuments({ user: blocked._id }) === 1, 'only one appeal row exists');

  console.log('\n  Google accounts have no password');

  const google = await User.create({
    email: 'g@x.com', name: 'Google User', googleId: 'google-sub-123',
    authProvider: 'google', isVerified: true,
  });
  ok(Boolean(google._id), 'a user with no passwordHash/securityQuestion saves when googleId is set');
  ok(google.hasPassword() === false, 'hasPassword() reports false for it');

  const noPassword = await throws(() => User.create({ email: 'nope@x.com', name: 'Nope' }));
  ok(noPassword?.name === 'ValidationError', 'a row with neither a password nor a googleId is still rejected');

  // The 500 this whole section exists to prevent.
  const pwLogin = await throws(() => auth.login({ email: 'g@x.com', password: 'anything' }, {}));
  ok(pwLogin?.statusCode === 400, 'password login against a Google account is a 400, not a 500');
  ok(pwLogin?.details?.code === 'USE_GOOGLE_SIGNIN', 'and it tells the client which button to point at');

  const sq = await throws(() => auth.getSecurityQuestion({ email: 'g@x.com' }));
  ok(sq?.statusCode === 400, 'asking for its security question is a handled 400');

  const cp = await throws(() => auth.changePassword(google._id, { currentPassword: 'x', newPassword: 'Abcdef1!' }, {}));
  ok(cp?.statusCode === 400, 'change-password against it is a handled 400');

  const safe = google.toSafeJSON();
  ok(safe.hasPassword === false && safe.authProvider === 'google', 'toSafeJSON reports the provider and password state');
  ok(!('passwordHash' in safe), 'and never leaks the hash');

  // A Google user setting a password through the reset link must work — that is the documented
  // way for them to gain one, and it runs a full document save through the same validators.
  google.resetTokenHash = require('crypto').createHash('sha256').update('tok').digest('hex');
  google.resetTokenExpiresAt = new Date(Date.now() + 60000);
  await google.save();
  await auth.resetPasswordWithToken({ email: 'g@x.com', token: 'tok', newPassword: 'Str0ng!Pass1' });
  const linked = await User.findById(google._id);
  ok(linked.hasPassword() === true, 'a Google account can set a first password via the reset link');
  const bothWays = await auth.login({ email: 'g@x.com', password: 'Str0ng!Pass1' }, {});
  ok(Boolean(bothWays?.tokens?.accessToken), 'and can then sign in with it as well as with Google');

  console.log('\n  Block / unblock notifies the customer');

  const { Notification } = require('../src/models/Notification');
  const users = require('../src/services/admin/user.service');

  const target = await User.create({
    email: 'blockme@x.com', name: 'Target', passwordHash: 'x',
    securityQuestion: 'q', securityAnswerHash: 'x', isVerified: true,
  });

  await users.setBlocked(target._id, true, 'Chargeback on AV-1234');
  const blockNotes = await Notification.find({ user: target._id, event: 'account:blockChanged' }).lean();
  ok(blockNotes.length === 1, 'blocking notifies the customer');
  ok(blockNotes[0].title.includes('blocked'), 'the notification says they were blocked');
  ok(blockNotes[0].body.includes('Chargeback'), 'and carries the reason the admin recorded');

  // Re-blocking an already-blocked account is a no-op a double-click produces; it must not
  // send a second "you have been blocked".
  await users.setBlocked(target._id, true, 'Chargeback on AV-1234');
  ok(
    (await Notification.countDocuments({ user: target._id, event: 'account:blockChanged' })) === 1,
    'blocking an already-blocked account sends nothing'
  );

  await users.setBlocked(target._id, false);
  const all = await Notification.find({ user: target._id, event: 'account:blockChanged' }).sort({ createdAt: 1 }).lean();
  ok(all.length === 2, 'unblocking notifies them too');
  ok(all[1].title.includes('restored'), 'and says the account is back');
  ok((await User.findById(target._id)).blockReason === null, 'unblocking clears the reason');

  console.log(`\n${fail === 0 ? 'all good' : `${fail} failed`}`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
