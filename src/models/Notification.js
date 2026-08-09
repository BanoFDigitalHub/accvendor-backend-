const mongoose = require('mongoose');

const NOTIFICATION_AUDIENCES = ['user', 'admin'];
const NOTIFICATION_CATEGORIES = [
  'order',
  'payment',
  'review',
  'ticket',
  'cancellation',
  'product',
  'account',
  'system',
];

const notificationSchema = new mongoose.Schema(
  {
    // 'user' notifications belong to exactly one account; 'admin' ones are a single row seen by
    // every admin (which is why read state is tracked per-admin in `readBy` rather than a flag).
    audience: { type: String, enum: NOTIFICATION_AUDIENCES, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    event: { type: String, required: true }, // mirrors the socket event name, e.g. 'order:created'
    category: { type: String, enum: NOTIFICATION_CATEGORIES, default: 'system' },

    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },

    // Client-side route the notification opens when clicked, e.g. '/dashboard/orders/AV-7K4P2M'.
    // Stored rather than derived so the destination stays correct if routing changes later.
    link: { type: String, default: null },

    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    readAt: { type: Date, default: null }, // audience: 'user'
    readBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] }, // audience: 'admin'
  },
  { timestamps: true }
);

// Customer feed: their own rows, newest first, optionally filtered to unread.
notificationSchema.index({ audience: 1, user: 1, createdAt: -1 });
notificationSchema.index({ audience: 1, user: 1, readAt: 1, createdAt: -1 });
// Admin feed: every admin row newest-first; unread is `readBy` not containing the admin's id.
notificationSchema.index({ audience: 1, createdAt: -1 });

module.exports = {
  Notification: mongoose.model('Notification', notificationSchema),
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CATEGORIES,
};
