const mongoose = require('mongoose');

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

// Tap-to-add tags offered under the review box. Fixed server-side so the stored values stay a
// closed set that product pages can aggregate and filter on.
const REVIEW_TAGS = [
  'Fast Delivery',
  'Excellent Service',
  'Easy to Use',
  'Highly Recommended',
  'Great Support',
  'Good Value',
  'Reliable',
];

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // The delivered order that entitles this user to review this product. Required in practice —
    // createReview refuses without one — and kept so eligibility stays auditable after the fact.
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    isVerifiedPurchase: { type: Boolean, default: false },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    tags: {
      type: [String],
      default: [],
      validate: (v) => v.length <= 4 && v.every((t) => REVIEW_TAGS.includes(t)),
    },

    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', index: true },
    moderatedAt: { type: Date, default: null },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Public product page: approved reviews for one product, newest first.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });

module.exports = { Review: mongoose.model('Review', reviewSchema), REVIEW_STATUSES, REVIEW_TAGS };
