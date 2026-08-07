const mongoose = require('mongoose');

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', index: true },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports = { Review: mongoose.model('Review', reviewSchema), REVIEW_STATUSES };
