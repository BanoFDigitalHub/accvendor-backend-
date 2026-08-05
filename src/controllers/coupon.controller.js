const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { evaluateCoupon } = require('../services/coupon.service');

const validate = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart || cart.items.length === 0) throw new ApiError(400, 'Your cart is empty');

  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) }, isActive: true });
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const items = cart.items
    .filter((i) => productMap.has(String(i.product)))
    .map((i) => {
      const product = productMap.get(String(i.product));
      return {
        productId: product._id,
        unitPrice: product.salePrice != null ? product.salePrice : product.price,
        quantity: i.quantity,
      };
    });

  const { discount } = await evaluateCoupon(req.body.code, { items, userId: req.user._id });
  apiResponse(res, 200, 'Coupon is valid', { discount });
});

module.exports = { validate };
