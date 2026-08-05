const { z } = require('zod');

const coercedInt = (def, min, max) =>
  z.coerce.number().int().min(min).max(max).optional().default(def);

const listProductsQuerySchema = z.object({
  page: coercedInt(1, 1, 100000),
  limit: coercedInt(12, 1, 60),
  category: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
  hot: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['newest', 'priceAsc', 'priceDesc']).optional().default('newest'),
});

const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

module.exports = { listProductsQuerySchema, slugParamSchema };
