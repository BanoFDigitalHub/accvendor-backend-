const express = require('express');
const controller = require('../../controllers/admin/settings.controller');
const validate = require('../../middlewares/validate.middleware');
const { settingsUpdateSchema } = require('../../validators/admin.validator');

const router = express.Router();

router.get('/', controller.getSettings);
router.patch('/', validate({ body: settingsUpdateSchema }), controller.updateSettings);

module.exports = router;
