const express = require('express');
const controller = require('../../controllers/admin/catalog.controller');
const validate = require('../../middlewares/validate.middleware');
const {
  idParamsSchema,
  paginationQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  listProductsAdminQuerySchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  couponCreateSchema,
  couponUpdateSchema,
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
} = require('../../validators/admin.validator');

const router = express.Router();

// Products
router.get('/products', validate({ query: listProductsAdminQuerySchema }), controller.listProducts);
router.post('/products', validate({ body: productCreateSchema }), controller.createProduct);
router.patch('/products/:id', validate({ params: idParamsSchema, body: productUpdateSchema }), controller.updateProduct);
router.delete('/products/:id', validate({ params: idParamsSchema }), controller.deleteProduct);

// Categories
router.get('/categories', controller.listCategories);
router.post('/categories', validate({ body: categoryCreateSchema }), controller.createCategory);
router.patch('/categories/:id', validate({ params: idParamsSchema, body: categoryUpdateSchema }), controller.updateCategory);
router.delete('/categories/:id', validate({ params: idParamsSchema }), controller.deleteCategory);

// Coupons
router.get('/coupons', validate({ query: paginationQuerySchema }), controller.listCoupons);
router.post('/coupons', validate({ body: couponCreateSchema }), controller.createCoupon);
router.patch('/coupons/:id', validate({ params: idParamsSchema, body: couponUpdateSchema }), controller.updateCoupon);
router.delete('/coupons/:id', validate({ params: idParamsSchema }), controller.deleteCoupon);

// Payment Methods
router.get('/payment-methods', controller.listPaymentMethods);
router.post('/payment-methods', validate({ body: paymentMethodCreateSchema }), controller.createPaymentMethod);
router.patch(
  '/payment-methods/:id',
  validate({ params: idParamsSchema, body: paymentMethodUpdateSchema }),
  controller.updatePaymentMethod
);
router.delete('/payment-methods/:id', validate({ params: idParamsSchema }), controller.deletePaymentMethod);

module.exports = router;
