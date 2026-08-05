const express = require('express');
const controller = require('../../controllers/admin/auditLog.controller');
const validate = require('../../middlewares/validate.middleware');
const { paginationQuerySchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: paginationQuerySchema }), controller.list);

module.exports = router;
