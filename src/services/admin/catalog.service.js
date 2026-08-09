const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Coupon = require('../../models/Coupon');
const PaymentMethod = require('../../models/PaymentMethod');
const ApiError = require('../../utils/ApiError');
const { destroyAsset } = require('../upload.service');
const { getRates } = require('../settings.service');
const { allPrices } = require('../../utils/money');

// --- Products ---

/**
 * Admin rows carry the same resolved `prices` block the storefront gets, so the catalog table
 * and the edit form show exactly what a customer would see — including which currencies are
 * explicit and which are still falling back to the conversion rate.
 */
function toAdminProduct(p, rates) {
  return { ...p, prices: allPrices(p, rates) };
}

async function listProducts({ page, limit, search }) {
  const filter = {};
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ name: rx }, { slug: rx }, { tags: rx }];
  }

  const skip = (page - 1) * limit;
  const [items, total, rates] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
    getRates(),
  ]);
  return {
    items: items.map((p) => toAdminProduct(p, rates)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Normalises the incoming media list.
 *
 * The admin panel may send either `media: [{url, publicId}]` (upload or paste) or a bare
 * `images: [url]`. Both are accepted and collapsed onto `media`, which the model mirrors back
 * onto `images` — so an image edit can never half-apply by writing one field and not the other.
 */
function normalizeMedia(data) {
  if (Array.isArray(data.media)) {
    return data.media
      .filter((m) => m && m.url)
      .map((m) => ({ url: String(m.url).trim(), publicId: m.publicId || null }));
  }
  if (Array.isArray(data.images)) {
    return data.images.filter(Boolean).map((url) => ({ url: String(url).trim(), publicId: null }));
  }
  return null;
}

async function createProduct(data) {
  const category = await Category.findById(data.category).lean();
  if (!category) throw new ApiError(400, 'Category not found');

  const media = normalizeMedia(data);
  const payload = { ...data };
  delete payload.media;
  delete payload.images;
  if (media) {
    payload.media = media;
    payload.images = media.map((m) => m.url);
  }

  try {
    const product = new Product(payload);
    await product.save();
    return product;
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A product with this slug already exists');
    throw err;
  }
}

async function updateProduct(id, data) {
  if (data.category) {
    const category = await Category.findById(data.category).lean();
    if (!category) throw new ApiError(400, 'Category not found');
  }

  // Loaded and saved as a document rather than patched with findByIdAndUpdate, so the schema's
  // pre-validate hook runs and keeps `media` and `images` in lockstep. A raw update bypasses
  // document middleware entirely, which is how an image edit could previously write one field
  // and leave the other stale.
  const product = await Product.findById(id);
  if (!product) throw new ApiError(404, 'Product not found');

  const media = normalizeMedia(data);
  const scalars = { ...data };
  delete scalars.media;
  delete scalars.images;

  // Only assign keys the caller actually sent. The update schema is `.partial()`, so an absent
  // key means "leave alone" — assigning undefined would blank the stored value instead.
  for (const [key, value] of Object.entries(scalars)) {
    if (value !== undefined) product[key] = value;
  }

  let orphanedPublicIds = [];
  if (media) {
    // Images dropped from the list are destroyed in Cloudinary, but only the ones we own
    // (publicId set — a pasted third-party URL has none and is simply forgotten).
    const keptUrls = new Set(media.map((m) => m.url));
    orphanedPublicIds = (product.media || [])
      .filter((m) => m.publicId && !keptUrls.has(m.url))
      .map((m) => m.publicId);
    product.media = media;
  }

  try {
    await product.save();
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A product with this slug already exists');
    throw err;
  }

  // After the database is durable, never before: a failed cleanup must not roll back the edit.
  await Promise.all(orphanedPublicIds.map(destroyAsset));

  return product;
}

async function deleteProduct(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new ApiError(404, 'Product not found');
  await Promise.all((product.media || []).filter((m) => m.publicId).map((m) => destroyAsset(m.publicId)));
  return product;
}

// --- Categories ---

async function listCategories() {
  return Category.find({}).sort({ name: 1 }).lean();
}

async function createCategory(data) {
  try {
    return await Category.create(data);
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A category with this name or slug already exists');
    throw err;
  }
}

async function updateCategory(id, data) {
  try {
    const category = await Category.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
    if (!category) throw new ApiError(404, 'Category not found');
    return category;
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A category with this name or slug already exists');
    throw err;
  }
}

async function deleteCategory(id) {
  const inUse = await Product.exists({ category: id });
  if (inUse) throw new ApiError(400, 'Cannot delete a category that still has products assigned to it');
  const category = await Category.findByIdAndDelete(id);
  if (!category) throw new ApiError(404, 'Category not found');
  return category;
}

// --- Coupons ---

async function listCoupons({ page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Coupon.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments({}),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function createCoupon(data) {
  try {
    return await Coupon.create(data);
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A coupon with this code already exists');
    throw err;
  }
}

async function updateCoupon(id, data) {
  try {
    const coupon = await Coupon.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
    if (!coupon) throw new ApiError(404, 'Coupon not found');
    return coupon;
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A coupon with this code already exists');
    throw err;
  }
}

async function deleteCoupon(id) {
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) throw new ApiError(404, 'Coupon not found');
  return coupon;
}

// --- Payment Methods ---

async function listPaymentMethods() {
  return PaymentMethod.find({}).sort({ sortOrder: 1, name: 1 }).lean();
}

async function createPaymentMethod(data) {
  return PaymentMethod.create(data);
}

async function updatePaymentMethod(id, data) {
  const existing = await PaymentMethod.findById(id);
  if (!existing) throw new ApiError(404, 'Payment method not found');

  // Replacing the QR destroys the one it supersedes, so swapping QR codes doesn't accumulate
  // orphaned Cloudinary assets.
  const replacingQr =
    data.qrImageUrl !== undefined && data.qrImageUrl !== existing.qrImageUrl && existing.qrImagePublicId;
  const oldQrPublicId = replacingQr ? existing.qrImagePublicId : null;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) existing[key] = value;
  }
  await existing.save();

  if (oldQrPublicId) await destroyAsset(oldQrPublicId);
  return existing;
}

async function deletePaymentMethod(id) {
  const pm = await PaymentMethod.findByIdAndDelete(id);
  if (!pm) throw new ApiError(404, 'Payment method not found');
  if (pm.qrImagePublicId) await destroyAsset(pm.qrImagePublicId);
  return pm;
}

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
