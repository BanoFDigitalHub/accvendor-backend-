const { Review } = require('../models/Review');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');

async function recomputeProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Product.updateOne({ _id: productId }, { ratingAvg: Math.round(avg * 10) / 10, reviewCount: count });
}

async function createReview(userId, slug, { rating, comment }) {
  const product = await Product.findOne({ slug, isActive: true }).lean();
  if (!product) throw new ApiError(404, 'Product not found');

  const existing = await Review.findOne({ product: product._id, user: userId });
  if (existing) throw new ApiError(400, 'You have already reviewed this product');

  return Review.create({ product: product._id, user: userId, rating, comment, status: 'pending' });
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  const masked = local.length <= 2 ? `${local[0]}*` : `${local[0]}${'*'.repeat(local.length - 2)}${local.slice(-1)}`;
  return `${masked}@${domain}`;
}

async function listApprovedReviews(slug, { page, limit }) {
  const product = await Product.findOne({ slug }).lean();
  if (!product) throw new ApiError(404, 'Product not found');

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Review.find({ product: product._id, status: 'approved' })
      .populate('user', 'email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ product: product._id, status: 'approved' }),
  ]);
  const masked = items.map((r) => ({ ...r, user: { reviewer: maskEmail(r.user.email) } }));
  return { items: masked, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminListReviews({ page, limit, status }) {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'email')
      .populate('product', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminModerateReview(reviewId, status) {
  const review = await Review.findById(reviewId);
  if (!review) throw new ApiError(404, 'Review not found');
  review.status = status;
  await review.save();
  await recomputeProductRating(review.product);
  return review;
}

module.exports = {
  createReview,
  listApprovedReviews,
  recomputeProductRating,
  adminListReviews,
  adminModerateReview,
};
