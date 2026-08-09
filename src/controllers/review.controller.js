const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const reviewService = require('../services/review.service');
const { REVIEW_TAGS } = require('../models/Review');

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.slug, req.body);
  apiResponse(res, 201, 'Review submitted for approval', { review });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await reviewService.listApprovedReviews(req.params.slug, { page, limit });
  apiResponse(res, 200, 'Reviews fetched', {
    reviews: result.items,
    tagCounts: result.tagCounts,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

// The tap-to-add tag list, served so the client never hardcodes a set that could drift from
// what the server will accept.
const tags = asyncHandler(async (req, res) => {
  apiResponse(res, 200, 'Review tags fetched', { tags: REVIEW_TAGS });
});

// Products this customer has received and not yet reviewed — the dashboard's review prompt.
const reviewable = asyncHandler(async (req, res) => {
  const products = await reviewService.listReviewableProducts(req.user._id);
  apiResponse(res, 200, 'Reviewable products fetched', { products });
});

module.exports = { create, list, tags, reviewable };
