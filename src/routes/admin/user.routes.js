const express = require('express');
const controller = require('../../controllers/admin/user.controller');
const validate = require('../../middlewares/validate.middleware');
const { idParamsSchema, listUsersQuerySchema, blockUserSchema, manualEmailSchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: listUsersQuerySchema }), controller.list);
router.post('/:id/block', validate({ params: idParamsSchema, body: blockUserSchema }), controller.block);
router.post('/:id/unblock', validate({ params: idParamsSchema }), controller.unblock);
router.post('/:id/email', validate({ params: idParamsSchema, body: manualEmailSchema }), controller.emailCustomer);

module.exports = router;
