const express = require('express');
const controller = require('../../controllers/admin/ad.controller');
const validate = require('../../middlewares/validate.middleware');
const { idParamsSchema, paginationQuerySchema, adCreateSchema, adUpdateSchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: paginationQuerySchema }), controller.list);
router.post('/', validate({ body: adCreateSchema }), controller.create);
router.patch('/:id', validate({ params: idParamsSchema, body: adUpdateSchema }), controller.update);
router.delete('/:id', validate({ params: idParamsSchema }), controller.remove);

module.exports = router;
