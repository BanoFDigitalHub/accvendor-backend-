const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const validate = require('../middlewares/validate.middleware');
const { publicWriteLimiter, searchLimiter } = require('../middlewares/rateLimit.middleware');
const { env } = require('../config/env');
const service = require('../services/twoFactorTool.service');

const router = express.Router();

const createShareSchema = z.object({
  secret: z.string().trim().min(8).max(256),
  label: z.string().trim().max(100).optional(),
  digits: z.coerce.number().int().min(6).max(8).optional().default(6),
  period: z.coerce.number().int().min(10).max(120).optional().default(30),
});

const shareTokenParamsSchema = z.object({
  // base64url, as produced by crypto.util.randomToken.
  token: z.string().trim().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid share token'),
});

const generateSchema = z.object({
  secret: z.string().trim().min(8).max(256),
  digits: z.coerce.number().int().min(6).max(8).optional().default(6),
  period: z.coerce.number().int().min(10).max(120).optional().default(30),
});

// Stateless: generates a code without storing anything. Used by the local tool page.
router.post(
  '/generate',
  searchLimiter,
  validate({ body: generateSchema }),
  asyncHandler(async (req, res) => {
    apiResponse(res, 200, 'Code generated', service.generateCode(req.body));
  })
);

// Creates a share link. Deliberately open to signed-out users — the 2FA tool is a public
// utility — but rate limited, and every share self-expires.
router.post(
  '/share',
  publicWriteLimiter,
  validate({ body: createShareSchema }),
  asyncHandler(async (req, res) => {
    const { token, expiresAt } = await service.createShare({
      ...req.body,
      userId: req.user?._id || null,
      ip: req.ip,
    });
    apiResponse(res, 201, 'Share link created', {
      token,
      // The share page only exists in the storefront bundle, so this must be the site origin —
      // on the admin domain the same path falls through to the admin login redirect.
      url: `${env.siteUrl.replace(/\/$/, '')}/2fa/share/${token}`,
      expiresAt,
    });
  })
);

// The share page polls this. Returns the current code and the seconds left in the step —
// never the underlying secret.
router.get(
  '/share/:token',
  searchLimiter,
  validate({ params: shareTokenParamsSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.getShareCode(req.params.token);
    apiResponse(res, 200, 'Code fetched', data);
  })
);

router.delete(
  '/share/:token',
  publicWriteLimiter,
  validate({ params: shareTokenParamsSchema }),
  asyncHandler(async (req, res) => {
    await service.revokeShare(req.params.token);
    apiResponse(res, 200, 'Share link revoked', null);
  })
);

module.exports = router;
