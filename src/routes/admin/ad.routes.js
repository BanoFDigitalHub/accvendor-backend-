const express = require('express');
const { z } = require('zod');
const controller = require('../../controllers/admin/ad.controller');
const validate = require('../../middlewares/validate.middleware');
const {
  idParamsSchema,
  listAdsAdminQuerySchema,
  adCreateSchema,
  adUpdateSchema,
} = require('../../validators/admin.validator');

const router = express.Router();

const setActiveSchema = z.object({ isActive: z.boolean() });

router.get('/options', controller.options);
router.get('/', validate({ query: listAdsAdminQuerySchema }), controller.list);
router.post('/', validate({ body: adCreateSchema }), controller.create);
router.get('/:id', validate({ params: idParamsSchema }), controller.detail);
router.patch('/:id', validate({ params: idParamsSchema, body: adUpdateSchema }), controller.update);
router.patch('/:id/active', validate({ params: idParamsSchema, body: setActiveSchema }), controller.setActive);
router.post('/:id/reset-stats', validate({ params: idParamsSchema }), controller.resetStats);
router.delete('/:id', validate({ params: idParamsSchema }), controller.remove);

module.exports = router;
