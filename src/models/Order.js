const mongoose = require('mongoose');
const { CURRENCIES, DEFAULT_CURRENCY } = require('../utils/money');
const { generateOrderNumber } = require('../utils/orderNumber');

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

const CANCEL_REQUEST_STATUSES = ['none', 'pending', 'approved', 'rejected'];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    slug: { type: String, default: null },
    image: { type: String, default: null },
    // Denominated in the order's `currency` — frozen at purchase time and never recomputed,
    // so editing a product's price later cannot move a historical order.
    unitPrice: { type: Number, required: true, min: 0 },
    unitPricePKR: { type: Number, default: null, min: 0 }, // same amount in base PKR, for reporting
    quantity: { type: Number, required: true, min: 1, default: 1 },
    durationDays: { type: Number, required: true, min: 1 },
    // Frozen at purchase alongside the price: shortening a product's warranty later must not
    // retroactively close the window on someone who already bought it.
    warrantyDays: { type: Number, default: 0, min: 0 },
    warranty: { type: String, default: '' },
    validity: { type: String, default: '' },
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
    instructions: { type: String, default: '' },
    qrImageUrl: { type: String, default: null },
  },
  { _id: false }
);

const cancelRequestSchema = new mongoose.Schema(
  {
    // 'none' is the only state from which a customer may open a request. A decided request
    // (approved *or* rejected) is terminal, which is what makes "one request per order" hold —
    // a rejection must not hand the customer a fresh attempt.
    status: { type: String, enum: CANCEL_REQUEST_STATUSES, default: 'none' },
    reason: { type: String, default: null, trim: true },
    requestedAt: { type: Date, default: null },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Human-facing identifier (AV-7K4P2M). The default generator makes it structurally
    // impossible for any code path — a controller, a seed, a test, a future migration — to
    // create an order without one, so this can never depend on a caller remembering. Collisions
    // are caught by the unique index and retried by utils/orderNumber.withUniqueOrderNumber.
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      default: generateOrderNumber,
    },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Denormalised at creation so admin order search can match on email/name without a
    // cross-collection lookup, and so the record survives a user rename.
    userEmail: { type: String, default: null, lowercase: true, trim: true },
    userName: { type: String, default: null, trim: true },

    items: { type: [orderItemSchema], required: true, validate: (v) => v.length > 0 },

    // --- Money ---------------------------------------------------------------------
    // Every amount below is in `currency`. `*PKR` mirrors carry the base-currency equivalent
    // at the rate that applied when the order was placed, so admin revenue reporting can sum
    // across mixed-currency orders without re-converting at today's rate.
    currency: { type: String, enum: CURRENCIES, default: DEFAULT_CURRENCY, required: true },
    fxSnapshot: {
      usdRate: { type: Number, default: null },
      eurRate: { type: Number, default: null },
    },
    subtotal: { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    subtotalPKR: { type: Number, default: null, min: 0 },
    discountPKR: { type: Number, default: 0, min: 0 },
    totalPKR: { type: Number, default: null, min: 0 },

    paymentMethod: { type: paymentMethodSnapshotSchema, required: true },
    paymentProofUrl: { type: String, default: null },
    paymentTransactionId: { type: String, default: null, trim: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment', index: true },

    // --- Unpaid window -------------------------------------------------------------
    // An order created but never paid for is held for env.unpaidOrderWindowMinutes and then
    // expired by the cron. Cleared as soon as proof is submitted.
    paymentDueAt: { type: Date, default: null, index: true },
    paymentReminderSentAt: { type: Date, default: null },
    expiredReason: { type: String, default: null },

    credentialFileUrl: { type: String, default: null },
    credentialText: { type: String, default: null },
    expiresAt: { type: Date, default: null, index: true },
    expiryReminderSentAt: { type: Date, default: null },

    // --- Warranty window -----------------------------------------------------------
    // The clock starts on delivery, not on purchase — a buyer waiting on an admin to hand over
    // credentials must not burn warranty days doing it. `warrantyUntil` is stamped once, at
    // delivery, from the longest warranty among the order's items.
    //
    // `null` means no warranty window applies (nothing in the order carried warrantyDays, or the
    // order predates the field) and the cancellation window is then unrestricted — every order
    // placed before this existed keeps behaving exactly as it did.
    deliveredAt: { type: Date, default: null },
    warrantyUntil: { type: Date, default: null },

    idempotencyKey: { type: String, required: true },

    rejectionReason: { type: String, default: null },
    cancelRequest: { type: cancelRequestSchema, default: () => ({}) },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// Admin order search matches orderNumber / email / name; the collation makes those
// case-insensitive without forcing a regex scan over the whole collection.
orderSchema.index({ userEmail: 1 });
orderSchema.index({ 'cancelRequest.status': 1, updatedAt: -1 });
// Drives the unpaid-order sweep: only pending_payment rows with a due date are ever scanned.
orderSchema.index({ status: 1, paymentDueAt: 1 });

// `cancelRequested` was a plain boolean before the request gained a lifecycle. Exposing it as a
// virtual keeps older readers (and any lingering client code) working off the new sub-document.
orderSchema.virtual('cancelRequested').get(function cancelRequested() {
  return this.cancelRequest?.status === 'pending';
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

module.exports = {
  Order: mongoose.model('Order', orderSchema),
  ORDER_STATUSES,
  CANCEL_REQUEST_STATUSES,
};
