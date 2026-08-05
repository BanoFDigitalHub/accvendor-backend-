const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const catalog = require('../../services/admin/catalog.service');

// Products
const listProducts = asyncHandler(async (req, res) => {
  const result = await catalog.listProducts(req.query);
  apiResponse(res, 200, 'Products fetched', {
    products: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});
const createProduct = asyncHandler(async (req, res) => {
  const product = await catalog.createProduct(req.body);
  apiResponse(res, 201, 'Product created', { product });
});
const updateProduct = asyncHandler(async (req, res) => {
  const product = await catalog.updateProduct(req.params.id, req.body);
  apiResponse(res, 200, 'Product updated', { product });
});
const deleteProduct = asyncHandler(async (req, res) => {
  await catalog.deleteProduct(req.params.id);
  apiResponse(res, 200, 'Product deleted', null);
});

// Categories
const listCategories = asyncHandler(async (req, res) => {
  const categories = await catalog.listCategories();
  apiResponse(res, 200, 'Categories fetched', { categories });
});
const createCategory = asyncHandler(async (req, res) => {
  const category = await catalog.createCategory(req.body);
  apiResponse(res, 201, 'Category created', { category });
});
const updateCategory = asyncHandler(async (req, res) => {
  const category = await catalog.updateCategory(req.params.id, req.body);
  apiResponse(res, 200, 'Category updated', { category });
});
const deleteCategory = asyncHandler(async (req, res) => {
  await catalog.deleteCategory(req.params.id);
  apiResponse(res, 200, 'Category deleted', null);
});

// Coupons
const listCoupons = asyncHandler(async (req, res) => {
  const result = await catalog.listCoupons(req.query);
  apiResponse(res, 200, 'Coupons fetched', {
    coupons: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});
const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await catalog.createCoupon(req.body);
  apiResponse(res, 201, 'Coupon created', { coupon });
});
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await catalog.updateCoupon(req.params.id, req.body);
  apiResponse(res, 200, 'Coupon updated', { coupon });
});
const deleteCoupon = asyncHandler(async (req, res) => {
  await catalog.deleteCoupon(req.params.id);
  apiResponse(res, 200, 'Coupon deleted', null);
});

// Payment Methods
const listPaymentMethods = asyncHandler(async (req, res) => {
  const paymentMethods = await catalog.listPaymentMethods();
  apiResponse(res, 200, 'Payment methods fetched', { paymentMethods });
});
const createPaymentMethod = asyncHandler(async (req, res) => {
  const paymentMethod = await catalog.createPaymentMethod(req.body);
  apiResponse(res, 201, 'Payment method created', { paymentMethod });
});
const updatePaymentMethod = asyncHandler(async (req, res) => {
  const paymentMethod = await catalog.updatePaymentMethod(req.params.id, req.body);
  apiResponse(res, 200, 'Payment method updated', { paymentMethod });
});
const deletePaymentMethod = asyncHandler(async (req, res) => {
  await catalog.deletePaymentMethod(req.params.id);
  apiResponse(res, 200, 'Payment method deleted', null);
});

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
