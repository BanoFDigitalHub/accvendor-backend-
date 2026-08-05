const express = require('express');
const controller = require('../controllers/review.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { slugParamSchema, createReviewSchema, listReviewsQuerySchema } = require('../validators/review.validator');

const router = express.Router({ mergeParams: true });

router.get('/', validate({ params: slugParamSchema, query: listReviewsQuerySchema }), controller.list);
router.post('/', requireAuth, validate({ params: slugParamSchema, body: createReviewSchema }), controller.create);

module.exports = router;
