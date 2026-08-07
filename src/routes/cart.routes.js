const express = require('express');
const controller = require('../controllers/cart.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { addItemSchema, updateItemParamsSchema, updateItemBodySchema, mergeSchema } = require('../validators/cart.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.get);
router.post('/items', validate({ body: addItemSchema }), controller.addItem);
router.patch(
  '/items/:productId',
  validate({ params: updateItemParamsSchema, body: updateItemBodySchema }),
  controller.updateItem
);
router.delete('/items/:productId', validate({ params: updateItemParamsSchema }), controller.removeItem);
router.post('/merge', validate({ body: mergeSchema }), controller.merge);

module.exports = router;
