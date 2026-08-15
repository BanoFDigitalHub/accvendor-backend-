const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const { sendMail } = require('../email.service');
const { accountBlockedEmail, accountUnblockedEmail } = require('../../utils/emailTemplates');
const { notifyUser } = require('../notification.service');

function toAdminUser(u) {
  return {
    _id: u._id,
    email: u.email,
    role: u.role,
    isVerified: u.isVerified,
    isBlocked: u.isBlocked,
    blockReason: u.blockReason,
    createdAt: u.createdAt,
  };
}

async function listUsers({ page, limit, search }) {
  const filter = {};
  if (search) filter.email = { $regex: search.trim(), $options: 'i' };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items: items.map(toAdminUser), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function setBlocked(userId, isBlocked, reason) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(400, 'Cannot block an admin account');

  // A no-op must not send an email. Toggling a block on an already-blocked account happens by
  // accident (a double-click, a stale list), and the customer should not get a second "you have
  // been blocked" for it.
  const changed = Boolean(user.isBlocked) !== Boolean(isBlocked);

  user.isBlocked = isBlocked;
  user.blockReason = isBlocked ? reason : null;
  // Bumping tokenVersion invalidates every outstanding access/refresh token for this user
  // immediately, rather than waiting for the 15m access token to expire naturally.
  user.tokenVersion += 1;
  await user.save();

  if (changed) {
    // Blocking signs the person out mid-session with no explanation anywhere — the storefront
    // simply stops letting them in. Without this the first they know of it is a login that
    // refuses them, and the appeal route is something they have to go and discover.
    //
    // Deliberately after `save()` and never awaited into the result: `sendMail` is timeout-capped
    // and degrades to the console stub, but the block itself must take effect whatever the
    // mailbox does. The same goes for the in-app notification, which a blocked user cannot read
    // right now but will see the moment they are let back in.
    await sendMail({
      to: user.email,
      subject: isBlocked ? 'Accvendor — your account has been blocked' : 'Accvendor — your account has been restored',
      html: isBlocked ? accountBlockedEmail(user) : accountUnblockedEmail(),
    });

    await notifyUser(user._id, {
      event: 'account:blockChanged',
      category: 'account',
      title: isBlocked ? 'Your account has been blocked' : 'Your account has been restored',
      body: isBlocked ? user.blockReason || 'Contact support to appeal.' : 'You can sign in and order again.',
      link: '/dashboard',
      meta: { isBlocked },
    });
  }

  return toAdminUser(user);
}

module.exports = { listUsers, setBlocked };
