const express = require('express');
const controller = require('../controllers/review.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { reviewLimiter } = require('../middlewares/rateLimit.middleware');
const { slugParamSchema, createReviewSchema, listReviewsQuerySchema } = require('../validators/review.validator');

// Mounted at /api/products/:slug/reviews.
const router = express.Router({ mergeParams: true });

router.get('/', validate({ params: slugParamSchema, query: listReviewsQuerySchema }), controller.list);
router.post(
  '/',
  requireAuth,
  reviewLimiter,
  validate({ params: slugParamSchema, body: createReviewSchema }),
  controller.create
);

module.exports = router;
