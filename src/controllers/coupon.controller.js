const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const { previewCoupon } = require('../services/coupon.service');

// The request carries a coupon code, a currency and (optionally) the exact lines being bought.
// It never carries prices or totals — previewCoupon resolves every amount from the database, so
// the figures shown at checkout are the same ones order creation will independently compute.
const validateCoupon = asyncHandler(async (req, res) => {
  const result = await previewCoupon(req.user._id, req.body);
  apiResponse(res, 200, 'Coupon applied', result);
});

module.exports = { validate: validateCoupon };
