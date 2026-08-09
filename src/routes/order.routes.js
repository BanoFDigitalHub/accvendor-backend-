const express = require('express');
const controller = require('../controllers/order.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { orderLimiter } = require('../middlewares/rateLimit.middleware');
const {
  createOrderSchema,
  submitProofSchema,
  orderIdParamsSchema,
  cancelRequestSchema,
  listOrdersQuerySchema,
  credentialDownloadQuerySchema,
} = require('../validators/order.validator');

const router = express.Router();

// Token-authorized (not cookie-authorized): the signed token in the query string is the
// credential, so this must stay outside requireAuth — a clicked email link has no session.
router.get(
  '/:id/credential',
  validate({ params: orderIdParamsSchema, query: credentialDownloadQuerySchema }),
  controller.downloadCredential
);

router.use(requireAuth);

router.get('/', validate({ query: listOrdersQuerySchema }), controller.list);
router.post('/', orderLimiter, validate({ body: createOrderSchema }), controller.create);
router.get('/:id', validate({ params: orderIdParamsSchema }), controller.detail);
router.post(
  '/:id/proof',
  orderLimiter,
  validate({ params: orderIdParamsSchema, body: submitProofSchema }),
  controller.submitProof
);
router.get('/:id/credential-link', validate({ params: orderIdParamsSchema }), controller.getCredentialLink);
router.post(
  '/:id/cancel-request',
  orderLimiter,
  validate({ params: orderIdParamsSchema, body: cancelRequestSchema }),
  controller.requestCancel
);

module.exports = router;
