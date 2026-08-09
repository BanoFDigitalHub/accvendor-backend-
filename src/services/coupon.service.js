const Coupon = require('../models/Coupon');
const { Order } = require('../models/Order');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { getRates } = require('./settings.service');
const { priceInCurrency, fromPkr, toPkr, round, formatMoney, isCurrency, DEFAULT_CURRENCY } = require('../utils/money');

/**
 * Validates a coupon against a set of lines and computes the discount.
 *
 * `items` is [{ productId, unitPrice, quantity }] where every unitPrice was resolved
 * server-side. Fixed-amount coupons and minimum-order thresholds are stored in PKR (the base
 * currency) and converted into the order's currency here, so one coupon behaves consistently
 * no matter which currency the buyer is shopping in.
 */
async function evaluateCoupon(code, { items, userId, currency = DEFAULT_CURRENCY, rates: providedRates }) {
  const cur = isCurrency(currency) ? currency : DEFAULT_CURRENCY;
  const rates = providedRates || (await getRates());

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
      status: { $nin: ['cancelled', 'rejected', 'expired'] },
    });
    if (userUsageCount >= coupon.perUserLimit) {
      throw new ApiError(400, 'You have already used this coupon the maximum number of times');
    }
  }

  if (!items || items.length === 0) {
    throw new ApiError(400, 'Add something to your cart before applying a coupon');
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

  const minOrderInCurrency = fromPkr(coupon.minOrderAmount, cur, rates);
  if (eligibleSubtotal < minOrderInCurrency) {
    throw new ApiError(400, `This coupon requires a minimum order of ${formatMoney(minOrderInCurrency, cur)}`);
  }

  const discount =
    coupon.type === 'percentage'
      ? round((eligibleSubtotal * coupon.value) / 100, cur)
      : Math.min(fromPkr(coupon.value, cur, rates), eligibleSubtotal);

  return { coupon, discount: round(discount, cur), eligibleSubtotal: round(eligibleSubtotal, cur), currency: cur };
}

/**
 * Preview endpoint behind POST /coupons/validate.
 *
 * Recomputes the whole basket from the database — the client sends product ids and quantities,
 * never prices or totals — so the figures shown at checkout are the same ones order creation
 * will independently arrive at. This is what fixes the previous "coupon can't find the cart"
 * failure: the lines are resolved here rather than trusted from the request.
 */
async function previewCoupon(userId, { code, currency, items: requestedItems, buyNow }) {
  const rates = await getRates();
  const cur = isCurrency(currency) ? currency : rates.defaultCurrency || DEFAULT_CURRENCY;

  let lines = requestedItems;
  if (buyNow?.productId) {
    lines = [{ productId: buyNow.productId, quantity: buyNow.quantity || 1 }];
  } else if (!lines || lines.length === 0) {
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ user: userId }).lean();
    lines = (cart?.items || []).map((i) => ({ productId: i.product, quantity: i.quantity }));
  }

  if (!lines || lines.length === 0) {
    throw new ApiError(400, 'Add something to your cart before applying a coupon');
  }

  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) }, isActive: true }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const resolvedItems = lines
    .filter((l) => productMap.has(String(l.productId)))
    .map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: priceInCurrency(productMap.get(String(l.productId)), cur, rates).effectivePrice,
    }));

  if (resolvedItems.length === 0) {
    throw new ApiError(400, 'The items in your cart are no longer available');
  }

  const subtotal = round(
    resolvedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    cur
  );
  const { coupon, discount } = await evaluateCoupon(code, { items: resolvedItems, userId, currency: cur, rates });

  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    currency: cur,
    subtotal,
    discount,
    total: Math.max(0, round(subtotal - discount, cur)),
  };
}

module.exports = { evaluateCoupon, previewCoupon, toPkr };
