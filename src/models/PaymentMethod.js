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
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
