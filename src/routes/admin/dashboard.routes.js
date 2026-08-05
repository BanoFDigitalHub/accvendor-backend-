const express = require('express');
const controller = require('../../controllers/admin/dashboard.controller');

const router = express.Router();

router.get('/stats', controller.stats);
router.get('/revenue', controller.revenue);

module.exports = router;
