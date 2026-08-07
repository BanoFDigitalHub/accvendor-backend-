const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const addItemSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1).max(20).optional().default(1),
});

const updateItemParamsSchema = z.object({
  productId: objectId,
});

const updateItemBodySchema = z.object({
  quantity: z.coerce.number().int().min(1).max(20),
});

const mergeSchema = z.object({
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.coerce.number().int().min(1).max(20).optional().default(1),
      })
    )
    .max(100),
});

module.exports = { addItemSchema, updateItemParamsSchema, updateItemBodySchema, mergeSchema };
