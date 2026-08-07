const { z } = require('zod');

const idParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

const listAdsQuerySchema = z.object({
  placement: z.string().trim().max(100).optional(),
});

module.exports = { idParamsSchema, listAdsQuerySchema };
