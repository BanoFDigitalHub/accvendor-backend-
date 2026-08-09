const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { getRates } = require('./settings.service');
const { priceInCurrency, round, isCurrency, DEFAULT_CURRENCY } = require('../utils/money');
const { optimizedUrl } = require('./upload.service');

const MAX_QTY_PER_ITEM = 20;

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

/**
 * Prices the cart in one currency, server-side.
 *
 * Line prices are resolved from the Product documents on every read rather than stored on the
 * cart, so a cart that has been sitting open reflects the current catalogue — and so no price
 * the client sends can influence what anything costs. `prices` rides along per line so the
 * currency switcher can re-render the whole cart without a refetch.
 */
async function toPublicCart(cart, currency) {
  const cur = isCurrency(currency) ? currency : DEFAULT_CURRENCY;
  const productIds = cart.items.map((i) => i.product);
  const [products, rates] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).populate('category', 'name slug').lean(),
    getRates(),
  ]);
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  let subtotal = 0;

  for (const item of cart.items) {
    const product = productMap.get(String(item.product));
    if (!product) continue; // product deleted; silently drop from view

    const resolved = priceInCurrency(product, cur, rates);
    const lineTotal = round(resolved.effectivePrice * item.quantity, cur);
    subtotal += lineTotal;

    items.push({
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: optimizedUrl(product.images?.[0] || null, { width: 200 }),
      unitPrice: resolved.effectivePrice,
      quantity: item.quantity,
      lineTotal,
      // Every currency for this line, so switching currency is instant and never refetches.
      prices: {
        PKR: priceInCurrency(product, 'PKR', rates),
        USD: priceInCurrency(product, 'USD', rates),
        EUR: priceInCurrency(product, 'EUR', rates),
      },
      warranty: product.warranty || '',
      validity: product.validity || '',
      stock: product.stock,
      inStock: product.stock >= item.quantity,
      isActive: product.isActive,
    });
  }

  return { items, subtotal: round(subtotal, cur), currency: cur, itemCount: items.reduce((n, i) => n + i.quantity, 0) };
}

async function getCart(userId, currency) {
  const cart = await getOrCreateCart(userId);
  return toPublicCart(cart, currency);
}

async function addItem(userId, productId, quantity, currency) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError(404, 'Product not found');

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, MAX_QTY_PER_ITEM);
  } else {
    cart.items.push({ product: productId, quantity });
  }
  await cart.save();
  return toPublicCart(cart, currency);
}

async function updateItem(userId, productId, quantity, currency) {
  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  if (!existing) throw new ApiError(404, 'Item not in cart');
  existing.quantity = Math.min(quantity, MAX_QTY_PER_ITEM);
  await cart.save();
  return toPublicCart(cart, currency);
}

async function removeItem(userId, productId, currency) {
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((i) => String(i.product) !== String(productId));
  await cart.save();
  return toPublicCart(cart, currency);
}

async function mergeCart(userId, guestItems, currency) {
  const cart = await getOrCreateCart(userId);
  const validProducts = await Product.find({
    _id: { $in: guestItems.map((i) => i.productId) },
    isActive: true,
  }).select('_id');
  const validIds = new Set(validProducts.map((p) => String(p._id)));

  for (const { productId, quantity } of guestItems) {
    if (!validIds.has(productId)) continue;
    const existing = cart.items.find((i) => String(i.product) === productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_QTY_PER_ITEM);
    } else {
      cart.items.push({ product: productId, quantity });
    }
  }
  await cart.save();
  return toPublicCart(cart, currency);
}

module.exports = { getCart, addItem, updateItem, removeItem, mergeCart, MAX_QTY_PER_ITEM };
