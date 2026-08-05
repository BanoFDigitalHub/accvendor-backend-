const express = require('express');
const controller = require('../../controllers/admin/twoFactor.controller');
const validate = require('../../middlewares/validate.middleware');
const { confirmTwoFactorSchema, disableTwoFactorSchema } = require('../../validators/twoFactor.validator');

const router = express.Router();

router.get('/status', controller.status);
router.post('/setup', controller.setup);
router.post('/confirm', validate({ body: confirmTwoFactorSchema }), controller.confirm);
router.post('/disable', validate({ body: disableTwoFactorSchema }), controller.disable);

module.exports = router;
