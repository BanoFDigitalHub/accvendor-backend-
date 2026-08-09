const { z } = require('zod');
const { CURRENCIES } = require('../utils/money');

const currencyField = z.enum(CURRENCIES).optional();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const cartQuerySchema = z.object({ currency: currencyField });

const addItemSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1).max(20).optional().default(1),
  currency: currencyField,
});

const updateItemParamsSchema = z.object({
  productId: objectId,
});

const updateItemBodySchema = z.object({
  quantity: z.coerce.number().int().min(1).max(20),
  currency: currencyField,
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
  currency: currencyField,
});

module.exports = { cartQuerySchema, addItemSchema, updateItemParamsSchema, updateItemBodySchema, mergeSchema };
