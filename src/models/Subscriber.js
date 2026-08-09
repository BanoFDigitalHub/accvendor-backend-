const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Where the signup came from, so a future campaign can segment on it.
    source: { type: String, default: 'footer', trim: true },
    isActive: { type: Boolean, default: true },
    unsubscribedAt: { type: Date, default: null },
    // Opaque token for a one-click unsubscribe link in future marketing mail.
    unsubscribeToken: { type: String, default: null, index: true, sparse: true },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscriber', subscriberSchema);
