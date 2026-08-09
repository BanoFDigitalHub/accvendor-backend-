const express = require('express');
const controller = require('../controllers/upload.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { uploadLimiter } = require('../middlewares/rateLimit.middleware');

const router = express.Router();

// Customer-scoped signing only. The admin-only signatures (product images, ad banners,
// payment QRs, credential files) live on the admin router instead — they need an
// admin-scoped cookie, and requireAuth here accepts site-scoped tokens exclusively.
// See routes/admin/upload.routes.js.
router.post('/sign/payment-proof', requireAuth, uploadLimiter, controller.signPaymentProof);
router.post('/sign/support-attachment', requireAuth, uploadLimiter, controller.signSupportAttachment);

module.exports = router;
