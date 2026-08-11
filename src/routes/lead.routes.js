const express = require('express');
const controller = require('../controllers/lead.controller');
const validate = require('../middlewares/validate.middleware');
const { publicWriteLimiter } = require('../middlewares/rateLimit.middleware');
const { leadInterestSchema } = require('../validators/lead.validator');

// Mounted at /api/leads. Deliberately open to signed-out visitors — the point of a waitlist is
// that it works before anyone has an account — but rate limited, since it emails the admins.
const router = express.Router();

router.post('/interest', publicWriteLimiter, validate({ body: leadInterestSchema }), controller.registerInterest);

module.exports = router;
