const express = require('express');
const controller = require('../controllers/coupon.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validateCouponSchema } = require('../validators/order.validator');

const router = express.Router();

router.post('/validate', requireAuth, validate({ body: validateCouponSchema }), controller.validate);

module.exports = router;
