const express = require('express');
const controller = require('../../controllers/admin/ticket.controller');
const validate = require('../../middlewares/validate.middleware');
const { idParamsSchema, listTicketsAdminQuerySchema, adminReplySchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: listTicketsAdminQuerySchema }), controller.list);
router.get('/:id', validate({ params: idParamsSchema }), controller.detail);
router.post('/:id/reply', validate({ params: idParamsSchema, body: adminReplySchema }), controller.reply);
router.post('/:id/close', validate({ params: idParamsSchema }), controller.close);

module.exports = router;
