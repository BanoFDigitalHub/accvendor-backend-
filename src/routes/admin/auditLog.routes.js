const express = require('express');
const controller = require('../../controllers/admin/auditLog.controller');
const validate = require('../../middlewares/validate.middleware');
const { paginationQuerySchema, deleteAuditLogSchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: paginationQuerySchema }), controller.list);
router.delete('/all', controller.removeAll);
router.delete('/', validate({ body: deleteAuditLogSchema }), controller.remove);

module.exports = router;
