const express = require('express');
const controller = require('../controllers/upload.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { uploadLimiter } = require('../middlewares/rateLimit.middleware');

const router = express.Router();

router.post('/sign/payment-proof', requireAuth, uploadLimiter, controller.signPaymentProof);
router.post('/sign/support-attachment', requireAuth, uploadLimiter, controller.signSupportAttachment);
router.post('/sign/product-image', requireAuth, requireRole('admin'), uploadLimiter, controller.signProductImage);
router.post('/sign/credential-file', requireAuth, requireRole('admin'), uploadLimiter, controller.signCredentialFile);

module.exports = router;
