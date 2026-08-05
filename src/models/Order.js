const mongoose = require('mongoose');

const ORDER_STATUSES = [
  'pending_payment',
  'proof_submitted',
  'under_review',
  'approved',
  'delivered',
  'expired',
  'rejected',
  'cancelled',
];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: { type: String, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    durationDays: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const paymentMethodSnapshotSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', required: true },
    name: { type: String, required: true },
    accountTitle: { type: String, required: true },
    accountNumber: { type: String, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true, validate: (v) => v.length > 0 },

    subtotal: { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    paymentMethod: { type: paymentMethodSnapshotSchema, required: true },
    paymentProofUrl: { type: String, default: null },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment', index: true },

    credentialFileUrl: { type: String, default: null },
    expiresAt: { type: Date, default: null, index: true },
    expiryReminderSentAt: { type: Date, default: null },

    idempotencyKey: { type: String, required: true },

    rejectionReason: { type: String, default: null },
    cancelRequested: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });

module.exports = { Order: mongoose.model('Order', orderSchema), ORDER_STATUSES };
