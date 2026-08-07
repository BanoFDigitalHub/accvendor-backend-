const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createOrderSchema = z.object({
  paymentMethodId: objectId,
  couponCode: z.string().trim().toUpperCase().min(1).max(50).optional(),
});

// Screenshot and transaction ID are independent — at least one is required, both can be
// sent together. A buyer whose upload fails (or who only has a reference number) must still
// be able to report their payment.
const submitProofSchema = z
  .object({
    proofUrl: z.string().trim().url().max(2000).optional(),
    transactionId: z.string().trim().min(1).max(100).optional(),
  })
  .refine((body) => body.proofUrl || body.transactionId, {
    message: 'Provide a payment screenshot, a transaction ID, or both',
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
