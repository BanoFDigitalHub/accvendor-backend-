const express = require('express');
const controller = require('../controllers/newsletter.controller');
const validate = require('../middlewares/validate.middleware');
const { subscribeSchema } = require('../validators/newsletter.validator');

const router = express.Router();

router.post('/subscribe', validate({ body: subscribeSchema }), controller.subscribe);

module.exports = router;
