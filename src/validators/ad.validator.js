const { z } = require('zod');
const { AD_PLACEMENTS, AD_DEVICES } = require('../models/Ad');

const idParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

const listAdsQuerySchema = z.object({
  placement: z.enum(AD_PLACEMENTS).optional(),
  // Device targeting is reported by the client. It only ever narrows which ads are served,
  // so a wrong or spoofed value costs nothing beyond a less relevant ad.
  device: z.enum(AD_DEVICES).optional(),
});

const impressionSchema = z.object({
  ids: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')).min(1).max(20),
});

module.exports = { idParamsSchema, listAdsQuerySchema, impressionSchema };
