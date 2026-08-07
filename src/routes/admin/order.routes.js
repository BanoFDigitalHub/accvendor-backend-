const express = require('express');
const controller = require('../../controllers/admin/order.controller');
const validate = require('../../middlewares/validate.middleware');
const {
  idParamsSchema,
  paginationQuerySchema,
  listOrdersAdminQuerySchema,
  rejectOrderSchema,
  rejectCancelRequestSchema,
  deliverOrderSchema,
} = require('../../validators/admin.validator');

const router = express.Router();

router.get('/cancel-requests', validate({ query: paginationQuerySchema }), controller.cancelRequests);
router.get('/', validate({ query: listOrdersAdminQuerySchema }), controller.list);
router.get('/:id', validate({ params: idParamsSchema }), controller.detail);
router.post('/:id/under-review', validate({ params: idParamsSchema }), controller.markUnderReview);
router.post('/:id/approve', validate({ params: idParamsSchema }), controller.approve);
router.post('/:id/reject', validate({ params: idParamsSchema, body: rejectOrderSchema }), controller.reject);
router.post('/:id/deliver', validate({ params: idParamsSchema, body: deliverOrderSchema }), controller.deliver);
router.post('/:id/confirm-cancel', validate({ params: idParamsSchema }), controller.confirmCancel);
router.post(
  '/:id/reject-cancel',
  validate({ params: idParamsSchema, body: rejectCancelRequestSchema }),
  controller.rejectCancel
);

module.exports = router;
