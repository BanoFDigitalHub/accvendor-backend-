const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createOrderSchema = z.object({
  paymentMethodId: objectId,
  couponCode: z.string().trim().toUpperCase().min(1).max(50).optional(),
});

const submitProofSchema = z.object({
  proofUrl: z.string().trim().url().max(2000),
});

const orderIdParamsSchema = z.object({
  id: objectId,
});

const validateCouponSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(50),
});

const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const credentialDownloadQuerySchema = z.object({
  token: z.string().min(1, 'Download token is required'),
});

module.exports = {
  createOrderSchema,
  submitProofSchema,
  orderIdParamsSchema,
  validateCouponSchema,
  listOrdersQuerySchema,
  credentialDownloadQuerySchema,
};
