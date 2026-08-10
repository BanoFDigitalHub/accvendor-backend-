const express = require('express');
const { z } = require('zod');
const controller = require('../../controllers/upload.controller');
const validate = require('../../middlewares/validate.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');

const importUrlSchema = z.object({
  url: z.string().trim().url().max(2000),
  kind: z.enum(['product-image', 'payment-qr']).optional().default('product-image'),
});

// Mounted under /api/admin, which already applies requireAdminAuth to everything below it.
// These endpoints previously lived on the public /api/uploads router behind requireAuth, which
// only accepts *site*-scoped tokens — the admin panel holds admin-scoped cookies, so every
// product-image and credential-file signature request 401'd. Signing lives on the admin router
// now so the scope matches, and so a 401 refreshes the admin session rather than the site one
// (the client picks its refresh endpoint from the `/admin/` path prefix).
const router = express.Router();

router.post('/sign/product-image', uploadLimiter, controller.signProductImage);
router.post('/sign/ad-image', uploadLimiter, controller.signAdImage);
router.post('/sign/payment-qr', uploadLimiter, controller.signPaymentQr);
router.post('/sign/credential-file', uploadLimiter, controller.signCredentialFile);

// Pulls a pasted image URL into Cloudinary so it is stored and managed like any upload.
router.post('/import-url', uploadLimiter, validate({ body: importUrlSchema }), controller.importImageFromUrl);

module.exports = router;
