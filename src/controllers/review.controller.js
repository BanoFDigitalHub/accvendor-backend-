const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const reviewService = require('../services/review.service');

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.slug, req.body);
  apiResponse(res, 201, 'Review submitted for approval', { review });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await reviewService.listApprovedReviews(req.params.slug, { page, limit });
  apiResponse(res, 200, 'Reviews fetched', {
    reviews: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

module.exports = { create, list };
