const express = require('express');
const controller = require('../controllers/ad.controller');
const validate = require('../middlewares/validate.middleware');
const { idParamsSchema, listAdsQuerySchema } = require('../validators/ad.validator');

const router = express.Router();

router.get('/', validate({ query: listAdsQuerySchema }), controller.list);
router.post('/:id/click', validate({ params: idParamsSchema }), controller.click);

module.exports = router;
