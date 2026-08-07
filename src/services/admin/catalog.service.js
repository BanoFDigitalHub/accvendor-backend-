const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Coupon = require('../../models/Coupon');
const PaymentMethod = require('../../models/PaymentMethod');
const ApiError = require('../../utils/ApiError');

// --- Products ---

async function listProducts({ page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Product.find({}).populate('category', 'name slug').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments({}),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function createProduct(data) {
  const category = await Category.findById(data.category).lean();
  if (!category) throw new ApiError(400, 'Category not found');
  try {
    return await Product.create(data);
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
  try {
    const product = await Product.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
    if (!product) throw new ApiError(404, 'Product not found');
    return product;
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'A product with this slug already exists');
    throw err;
  }
}

async function deleteProduct(id) {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw new ApiError(404, 'Product not found');
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
  const pm = await PaymentMethod.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
  if (!pm) throw new ApiError(404, 'Payment method not found');
  return pm;
}

async function deletePaymentMethod(id) {
  const pm = await PaymentMethod.findByIdAndDelete(id);
  if (!pm) throw new ApiError(404, 'Payment method not found');
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
