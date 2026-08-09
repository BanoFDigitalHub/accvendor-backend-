const express = require('express');
const controller = require('../controllers/review.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

// Mounted at /api/reviews. The per-product review collection lives at
// /api/products/:slug/reviews (review.routes.js); these are the two account-level helpers that
// have no product in their path.
const router = express.Router();

router.get('/tags', controller.tags);
router.get('/reviewable', requireAuth, controller.reviewable);

module.exports = router;
