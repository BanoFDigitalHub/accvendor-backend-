const express = require('express');
const controller = require('../controllers/product.controller');
const validate = require('../middlewares/validate.middleware');
const { listProductsQuerySchema, slugParamSchema } = require('../validators/product.validator');

const router = express.Router();

router.get('/', validate({ query: listProductsQuerySchema }), controller.list);
router.get('/hot', controller.hot);
router.get('/:slug', validate({ params: slugParamSchema }), controller.detail);

module.exports = router;
