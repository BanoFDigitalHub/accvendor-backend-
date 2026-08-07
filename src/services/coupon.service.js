const Coupon = require('../models/Coupon');
const { Order } = require('../models/Order');
const ApiError = require('../utils/ApiError');

/**
 * Validates a coupon against a cart and computes the discount.
 * items: [{ productId, unitPrice, quantity }]
 */
async function evaluateCoupon(code, { items, userId }) {
  const coupon = await Coupon.findOne({ code, isActive: true });
  if (!coupon) throw new ApiError(404, 'Invalid coupon code');

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new ApiError(400, 'This coupon has expired');
  }

  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError(400, 'This coupon has reached its usage limit');
  }

  if (userId) {
    const userUsageCount = await Order.countDocuments({
      user: userId,
      couponCode: code,
      status: { $nin: ['cancelled', 'rejected'] },
    });
    if (userUsageCount >= coupon.perUserLimit) {
      throw new ApiError(400, 'You have already used this coupon the maximum number of times');
    }
  }

  let eligibleSubtotal;
  if (coupon.applicableProducts.length > 0) {
    const applicableSet = new Set(coupon.applicableProducts.map(String));
    eligibleSubtotal = items
      .filter((i) => applicableSet.has(String(i.productId)))
      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    if (eligibleSubtotal <= 0) {
      throw new ApiError(400, 'This coupon does not apply to the items in your cart');
    }
  } else {
    eligibleSubtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  }

  if (eligibleSubtotal < coupon.minOrderAmount) {
    throw new ApiError(400, `This coupon requires a minimum order of Rs ${coupon.minOrderAmount}`);
  }

  const discount =
    coupon.type === 'percentage'
      ? Math.round((eligibleSubtotal * coupon.value) / 100)
      : Math.min(coupon.value, eligibleSubtotal);

  return { coupon, discount };
}

module.exports = { evaluateCoupon };
