const express = require('express');
const controller = require('../../controllers/admin/user.controller');
const validate = require('../../middlewares/validate.middleware');
const { idParamsSchema, listUsersQuerySchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: listUsersQuerySchema }), controller.list);
router.post('/:id/block', validate({ params: idParamsSchema }), controller.block);
router.post('/:id/unblock', validate({ params: idParamsSchema }), controller.unblock);

module.exports = router;
