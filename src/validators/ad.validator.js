const { z } = require('zod');
const { AD_PLACEMENTS, AD_DEVICES, AD_PAGES } = require('../models/Ad');

const idParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

const listAdsQuerySchema = z.object({
  placement: z.enum(AD_PLACEMENTS).optional(),
  // Device and page are reported by the client. They only ever narrow which ads are served,
  // so a wrong or spoofed value costs nothing beyond a less relevant ad.
  device: z.enum(AD_DEVICES).optional(),
  page: z.enum(AD_PAGES).optional(),
});

const impressionSchema = z.object({
  ids: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')).min(1).max(20),
});

module.exports = { idParamsSchema, listAdsQuerySchema, impressionSchema };
