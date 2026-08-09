const express = require('express');
const controller = require('../controllers/ad.controller');
const validate = require('../middlewares/validate.middleware');
const { searchLimiter } = require('../middlewares/rateLimit.middleware');
const { idParamsSchema, listAdsQuerySchema, impressionSchema } = require('../validators/ad.validator');

const router = express.Router();

router.get('/', validate({ query: listAdsQuerySchema }), controller.list);
router.get('/placements', validate({ query: listAdsQuerySchema }), controller.byPlacement);
// Counter bumps only — bounded by the same ceiling as search so a runaway client can't spam them.
router.post('/impressions', searchLimiter, validate({ body: impressionSchema }), controller.impressions);
router.post('/:id/click', searchLimiter, validate({ params: idParamsSchema }), controller.click);

module.exports = router;
