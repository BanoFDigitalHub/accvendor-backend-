const express = require('express');
const controller = require('../../controllers/admin/review.controller');
const validate = require('../../middlewares/validate.middleware');
const { idParamsSchema, listReviewsAdminQuerySchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', validate({ query: listReviewsAdminQuerySchema }), controller.list);
router.post('/:id/approve', validate({ params: idParamsSchema }), controller.approve);
router.post('/:id/reject', validate({ params: idParamsSchema }), controller.reject);

module.exports = router;
