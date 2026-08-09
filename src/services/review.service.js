const { Review, REVIEW_TAGS } = require('../models/Review');
const Product = require('../models/Product');
const { Order } = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { notifyAdmins, notifyUser } = require('./notification.service');

// Only a delivered order proves the customer actually received the product. An order that is
// merely paid for (or was later cancelled/refunded) does not earn a review.
const PURCHASED_STATUSES = ['delivered', 'expired'];

async function recomputeProductRating(productId) {
  const stats = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] || {};
  await Product.updateOne({ _id: productId }, { ratingAvg: Math.round(avg * 10) / 10, reviewCount: count });
}

/**
 * Finds the order that entitles this user to review this product, if any.
 *
 * Verification is a database question, never a client claim: the order must belong to the
 * user, be in a delivered state, and actually contain the product.
 */
async function findQualifyingOrder(userId, productId) {
  return Order.findOne({
    user: userId,
    status: { $in: PURCHASED_STATUSES },
    'items.product': productId,
  })
    .sort({ createdAt: -1 })
    .select('_id orderNumber')
    .lean();
}

async function createReview(userId, slug, { rating, comment, tags = [] }) {
  const product = await Product.findOne({ slug, isActive: true }).lean();
  if (!product) throw new ApiError(404, 'Product not found');

  const existing = await Review.findOne({ product: product._id, user: userId });
  if (existing) throw new ApiError(409, 'You have already reviewed this product');

  const order = await findQualifyingOrder(userId, product._id);
  if (!order) {
    throw new ApiError(403, 'Only customers who have purchased and received this product can review it');
  }

  const cleanTags = [...new Set(tags)].filter((t) => REVIEW_TAGS.includes(t)).slice(0, 4);

  const review = await Review.create({
    product: product._id,
    user: userId,
    order: order._id,
    isVerifiedPurchase: true,
    rating,
    comment,
    tags: cleanTags,
    status: 'pending',
  });

  await notifyAdmins({
    event: 'review:created',
    category: 'review',
    title: 'New review awaiting approval',
    body: `${rating}★ on ${product.name}`,
    link: '/admin/reviews',
    meta: { reviewId: String(review._id), productSlug: product.slug },
  });

  return review;
}

/**
 * Products this user may still review: bought, received, and not yet reviewed.
 * Powers the "write a review" list in the customer dashboard.
 */
async function listReviewableProducts(userId) {
  const orders = await Order.find({ user: userId, status: { $in: PURCHASED_STATUSES } })
    .select('items.product items.name items.image orderNumber createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const purchased = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = String(item.product);
      if (!purchased.has(key)) {
        purchased.set(key, { productId: item.product, name: item.name, image: item.image, orderNumber: order.orderNumber });
      }
    }
  }
  if (purchased.size === 0) return [];

  const productIds = [...purchased.values()].map((p) => p.productId);
  const [reviewed, products] = await Promise.all([
    Review.find({ user: userId, product: { $in: productIds } }).select('product status').lean(),
    Product.find({ _id: { $in: productIds } }).select('name slug images').lean(),
  ]);

  const reviewedMap = new Map(reviewed.map((r) => [String(r.product), r.status]));
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  return [...purchased.values()]
    .map((entry) => {
      const product = productMap.get(String(entry.productId));
      if (!product) return null; // product was deleted since purchase
      return {
        productId: String(entry.productId),
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] || entry.image || null,
        orderNumber: entry.orderNumber,
        reviewStatus: reviewedMap.get(String(entry.productId)) || null,
        canReview: !reviewedMap.has(String(entry.productId)),
      };
    })
    .filter(Boolean);
}

function maskEmail(email) {
  if (!email) return 'Verified buyer';
  const [local, domain] = email.split('@');
  if (!domain) return 'Verified buyer';
  const masked = local.length <= 2 ? `${local[0]}*` : `${local[0]}${'*'.repeat(local.length - 2)}${local.slice(-1)}`;
  return `${masked}@${domain}`;
}

function toPublicReview(r) {
  return {
    _id: r._id,
    rating: r.rating,
    comment: r.comment,
    tags: r.tags || [],
    isVerifiedPurchase: Boolean(r.isVerifiedPurchase),
    createdAt: r.createdAt,
    // Moderation state is never exposed publicly — only approved rows reach this function,
    // and `status` is deliberately not carried through.
    //
    // The reviewer is shown as a masked email, never their real name: a customer who bought an
    // account did not agree to have their name published next to that purchase.
    user: { reviewer: maskEmail(r.user?.email) },
  };
}

async function listApprovedReviews(slug, { page, limit }) {
  const product = await Product.findOne({ slug }).lean();
  if (!product) throw new ApiError(404, 'Product not found');

  const skip = (page - 1) * limit;
  const [items, total, tagCounts] = await Promise.all([
    Review.find({ product: product._id, status: 'approved' })
      .populate('user', 'email name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ product: product._id, status: 'approved' }),
    Review.aggregate([
      { $match: { product: product._id, status: 'approved' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    items: items.map(toPublicReview),
    tagCounts: tagCounts.map((t) => ({ tag: t._id, count: t.count })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function adminListReviews({ page, limit, status }) {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'email name')
      .populate('product', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminModerateReview(reviewId, status, adminId) {
  const review = await Review.findById(reviewId);
  if (!review) throw new ApiError(404, 'Review not found');

  review.status = status;
  review.moderatedAt = new Date();
  review.moderatedBy = adminId || null;
  await review.save();

  // The product's cached ratingAvg/reviewCount are recomputed from approved rows only, so an
  // approval takes effect on the product page in the same request.
  await recomputeProductRating(review.product);

  if (status === 'approved') {
    const product = await Product.findById(review.product).select('name slug').lean();
    await notifyUser(review.user, {
      event: 'review:approved',
      category: 'review',
      title: 'Your review was published',
      body: product ? `Your review of ${product.name} is now live.` : '',
      link: product ? `/products/${product.slug}` : null,
      meta: { reviewId: String(review._id) },
    });
  }

  return review;
}

module.exports = {
  createReview,
  listReviewableProducts,
  listApprovedReviews,
  recomputeProductRating,
  adminListReviews,
  adminModerateReview,
  REVIEW_TAGS,
};
