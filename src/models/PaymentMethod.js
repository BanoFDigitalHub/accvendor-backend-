const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "JazzCash", "Binance", "Bank Transfer"
    type: {
      type: String,
      enum: ['mobile_wallet', 'bank', 'crypto', 'other'],
      required: true,
    },
    accountTitle: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, default: '' },

    // Scan-to-pay QR supplied by the admin (Cloudinary upload or pasted URL). Rendered on
    // checkout next to the account details; publicId is kept so a replaced QR can be destroyed.
    qrImageUrl: { type: String, default: null },
    qrImagePublicId: { type: String, default: null },

    // Optional brand mark; site/components/PaymentMethodIcon.jsx prefers this over its
    // built-in name-matched icon when set.
    logoUrl: { type: String, default: null },

    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paymentMethodSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
