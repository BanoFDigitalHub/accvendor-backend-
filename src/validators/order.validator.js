const { z } = require('zod');
const { CURRENCIES } = require('../utils/money');
const { ORDER_STATUSES } = require('../models/Order');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// Buy Now purchases exactly one product at one quantity, independent of whatever is in the
// cart. Sending it is what tells order creation to skip the cart entirely.
const buyNowSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(1).max(99).optional().default(1),
});

const createOrderSchema = z.object({
  paymentMethodId: objectId,
  couponCode: z.string().trim().toUpperCase().min(1).max(50).optional(),
  // The currency the buyer is shopping in. Prices are never sent by the client — the server
  // resolves every amount for this currency itself.
  currency: z.enum(CURRENCIES).optional(),
  buyNow: buyNowSchema.optional(),
});

// **The screenshot is required.** It used to be one-of — screenshot *or* transaction ID — on the
// reasoning that a buyer whose upload failed should still be able to report their payment. In
// practice a bare reference number is not something the admin can verify: it is a string the
// buyer typed, it matches nothing until it is found in a bank statement, and an order sitting in
// `proof_submitted` with nothing to look at is worse than one still waiting for proof, because it
// leaves the queue looking actionable when it is not. The screenshot is the evidence; the
// transaction ID stays optional alongside it, because it is what makes the screenshot quick to
// reconcile.
const submitProofSchema = z.object({
  proofUrl: z.string().trim().url().max(2000, 'Payment screenshot URL is too long'),
  transactionId: z.string().trim().min(1).max(100).optional(),
});

// Accepts either a Mongo id or a human order number (AV-7K4P2M), so a customer can paste the
// reference from their email straight into the URL.
const orderIdParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((v) => /^[0-9a-fA-F]{24}$/.test(v) || /^AV-[A-Z0-9]{4,12}$/i.test(v), 'Invalid order reference'),
});

const validateCouponSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(50),
  currency: z.enum(CURRENCIES).optional(),
  items: z
    .array(z.object({ productId: objectId, quantity: z.coerce.number().int().min(1).max(99) }))
    .max(50)
    .optional(),
  buyNow: buyNowSchema.optional(),
});

const changePaymentMethodSchema = z.object({
  paymentMethodId: objectId,
});

const cancelRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  status: z.enum(ORDER_STATUSES).optional(),
  // Customer-side search. Always applied on top of a `user` filter server-side, so it can
  // only ever traverse the requester's own orders.
  search: z.string().trim().max(200).optional(),
});

const credentialDownloadQuerySchema = z.object({
  token: z.string().min(1, 'Download token is required'),
});

module.exports = {
  changePaymentMethodSchema,
  createOrderSchema,
  submitProofSchema,
  orderIdParamsSchema,
  validateCouponSchema,
  cancelRequestSchema,
  listOrdersQuerySchema,
  credentialDownloadQuerySchema,
};
