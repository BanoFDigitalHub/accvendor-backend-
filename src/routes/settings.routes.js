const express = require('express');
const controller = require('../controllers/settings.controller');

const router = express.Router();

router.get('/', controller.getSettings);

module.exports = router;
