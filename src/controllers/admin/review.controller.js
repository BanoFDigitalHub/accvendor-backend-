const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const reviewService = require('../../services/review.service');

const list = asyncHandler(async (req, res) => {
  const result = await reviewService.adminListReviews(req.query);
  apiResponse(res, 200, 'Reviews fetched', {
    reviews: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const approve = asyncHandler(async (req, res) => {
  const review = await reviewService.adminModerateReview(req.params.id, 'approved');
  apiResponse(res, 200, 'Review approved', { review });
});

const reject = asyncHandler(async (req, res) => {
  const review = await reviewService.adminModerateReview(req.params.id, 'rejected');
  apiResponse(res, 200, 'Review rejected', { review });
});

module.exports = { list, approve, reject };
