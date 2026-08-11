const express = require('express');
const controller = require('../../controllers/admin/lead.controller');
const validate = require('../../middlewares/validate.middleware');
const { idParamsSchema, manualEmailSchema } = require('../../validators/admin.validator');
const { listLeadsQuerySchema, exportLeadsQuerySchema, updateLeadSchema } = require('../../validators/lead.validator');

const router = express.Router();

router.get('/', validate({ query: listLeadsQuerySchema }), controller.list);
router.get('/export', validate({ query: exportLeadsQuerySchema }), controller.exportCsv);
router.post('/:id/email', validate({ params: idParamsSchema, body: manualEmailSchema }), controller.email);
router.patch('/:id', validate({ params: idParamsSchema, body: updateLeadSchema }), controller.update);
router.delete('/:id', validate({ params: idParamsSchema }), controller.remove);

module.exports = router;
