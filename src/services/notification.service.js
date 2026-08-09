const { Notification } = require('../models/Notification');
const { emitToAdmins, emitToUser } = require('./socket.service');

/**
 * Notifications are persisted first and pushed over the socket second.
 *
 * The socket is a live convenience, not the record: a customer who was offline when their order
 * shipped still finds the notification on /dashboard/notifications, and nothing is lost to a
 * page reload the way the old in-memory-only feed lost everything past the most recent 20.
 *
 * A failure to notify must never fail the business action that triggered it, so every helper
 * here swallows its own errors and logs them.
 */

async function notifyUser(userId, { event, category, title, body = '', link = null, meta = null }) {
  try {
    const notification = await Notification.create({
      audience: 'user',
      user: userId,
      event,
      category,
      title,
      body,
      link,
      meta,
    });
    emitToUser(userId, event, { ...(meta || {}), notification: serialize(notification) });
    return notification;
  } catch (err) {
    console.error('[notification] failed to notify user:', err.message);
    return null;
  }
}

async function notifyAdmins({ event, category, title, body = '', link = null, meta = null }) {
  try {
    const notification = await Notification.create({
      audience: 'admin',
      user: null,
      event,
      category,
      title,
      body,
      link,
      meta,
    });
    emitToAdmins(event, { ...(meta || {}), notification: serialize(notification) });
    return notification;
  } catch (err) {
    console.error('[notification] failed to notify admins:', err.message);
    return null;
  }
}

function serialize(n, viewerId = null) {
  const isRead = n.audience === 'admin' ? (n.readBy || []).some((id) => String(id) === String(viewerId)) : Boolean(n.readAt);
  return {
    id: String(n._id),
    audience: n.audience,
    event: n.event,
    category: n.category,
    title: n.title,
    body: n.body,
    link: n.link,
    meta: n.meta,
    isRead,
    createdAt: n.createdAt,
  };
}

/**
 * Paginated feed for one viewer.
 *
 * `filter` is one of all | unread | read | latest. 'latest' is the same set as 'all' but capped
 * to the most recent window — it exists so the bell dropdown and the full page can share this
 * one query path instead of drifting apart.
 */
async function list({ audience, viewerId, page = 1, limit = 20, filter = 'all' }) {
  const query = audience === 'admin' ? { audience: 'admin' } : { audience: 'user', user: viewerId };

  if (filter === 'unread') {
    Object.assign(query, audience === 'admin' ? { readBy: { $ne: viewerId } } : { readAt: null });
  } else if (filter === 'read') {
    Object.assign(query, audience === 'admin' ? { readBy: viewerId } : { readAt: { $ne: null } });
  }

  const skip = (page - 1) * limit;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
    countUnread({ audience, viewerId }),
  ]);

  return {
    items: items.map((n) => serialize(n, viewerId)),
    unreadCount,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function countUnread({ audience, viewerId }) {
  const query =
    audience === 'admin'
      ? { audience: 'admin', readBy: { $ne: viewerId } }
      : { audience: 'user', user: viewerId, readAt: null };
  return Notification.countDocuments(query);
}

async function markRead({ audience, viewerId, notificationId }) {
  // The audience/user clause is part of the filter, not a separate check, so a customer can
  // never mark someone else's notification — the update simply matches nothing.
  const query =
    audience === 'admin'
      ? { _id: notificationId, audience: 'admin' }
      : { _id: notificationId, audience: 'user', user: viewerId };

  const update = audience === 'admin' ? { $addToSet: { readBy: viewerId } } : { $set: { readAt: new Date() } };
  const result = await Notification.updateOne(query, update);
  return result.matchedCount > 0;
}

async function markAllRead({ audience, viewerId }) {
  const query =
    audience === 'admin'
      ? { audience: 'admin', readBy: { $ne: viewerId } }
      : { audience: 'user', user: viewerId, readAt: null };

  const update = audience === 'admin' ? { $addToSet: { readBy: viewerId } } : { $set: { readAt: new Date() } };
  const result = await Notification.updateMany(query, update);
  return result.modifiedCount;
}

module.exports = { notifyUser, notifyAdmins, list, countUnread, markRead, markAllRead, serialize };
