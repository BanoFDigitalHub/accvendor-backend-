const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

async function toPublicCart(cart) {
  const productIds = cart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } }).populate('category', 'name slug').lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  let subtotal = 0;

  for (const item of cart.items) {
    const product = productMap.get(String(item.product));
    if (!product) continue; // product deleted; silently drop from view
    const effectivePrice = product.salePrice != null ? product.salePrice : product.price;
    const lineTotal = effectivePrice * item.quantity;
    subtotal += lineTotal;
    items.push({
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || null,
      unitPrice: effectivePrice,
      quantity: item.quantity,
      lineTotal,
      inStock: product.stock >= item.quantity,
      isActive: product.isActive,
    });
  }

  return { items, subtotal };
}

async function getCart(userId) {
  const cart = await getOrCreateCart(userId);
  return toPublicCart(cart);
}

async function addItem(userId, productId, quantity) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new ApiError(404, 'Product not found');

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, 20);
  } else {
    cart.items.push({ product: productId, quantity });
  }
  await cart.save();
  return toPublicCart(cart);
}

async function updateItem(userId, productId, quantity) {
  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  if (!existing) throw new ApiError(404, 'Item not in cart');
  existing.quantity = quantity;
  await cart.save();
  return toPublicCart(cart);
}

async function removeItem(userId, productId) {
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((i) => String(i.product) !== String(productId));
  await cart.save();
  return toPublicCart(cart);
}

async function mergeCart(userId, guestItems) {
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
      existing.quantity = Math.min(existing.quantity + quantity, 20);
    } else {
      cart.items.push({ product: productId, quantity });
    }
  }
  await cart.save();
  return toPublicCart(cart);
}

module.exports = { getCart, addItem, updateItem, removeItem, mergeCart };
