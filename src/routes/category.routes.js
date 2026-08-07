const express = require('express');
const controller = require('../controllers/category.controller');
const validate = require('../middlewares/validate.middleware');
const { slugParamSchema } = require('../validators/category.validator');

const router = express.Router();

router.get('/', controller.list);
router.get('/:slug', validate({ params: slugParamSchema }), controller.detail);

module.exports = router;
