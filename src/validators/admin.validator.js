const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const idParamsSchema = z.object({ id: objectId });

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// --- Products ---
const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().trim().min(1).max(5000),
  images: z.array(z.string().trim().url()).max(10).optional().default([]),
  category: objectId,
  price: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0).nullable().optional(),
  durationDays: z.coerce.number().int().min(1),
  stock: z.coerce.number().int().min(0),
  isHotProduct: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});
const productUpdateSchema = productCreateSchema.partial();

// --- Categories ---
const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().trim().max(1000).optional().default(''),
  image: z.string().trim().url().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});
const categoryUpdateSchema = categoryCreateSchema.partial();

// --- Coupons ---
const couponCreateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  type: z.enum(['percentage', 'fixed']),
  value: z.coerce.number().min(0),
  minOrderAmount: z.coerce.number().min(0).optional().default(0),
  usageLimit: z.coerce.number().int().min(1).nullable().optional(),
  perUserLimit: z.coerce.number().int().min(1).optional().default(1),
  expiresAt: z.coerce.date().nullable().optional(),
  applicableProducts: z.array(objectId).optional().default([]),
  isActive: z.boolean().optional().default(true),
});
const couponUpdateSchema = couponCreateSchema.partial();

// --- Payment Methods ---
const paymentMethodCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['mobile_wallet', 'bank', 'crypto', 'other']),
  accountTitle: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(1000).optional().default(''),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});
const paymentMethodUpdateSchema = paymentMethodCreateSchema.partial();

// --- Users ---
const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});

// --- Orders ---
const rejectOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
const deliverOrderSchema = z.object({
  credentialFileUrl: z.string().trim().url().max(2000),
  expiresAt: z.coerce.date().optional(),
});
const listOrdersAdminQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['pending_payment', 'proof_submitted', 'under_review', 'approved', 'delivered', 'expired', 'rejected', 'cancelled'])
    .optional(),
});

// --- Support tickets (admin side) ---
const adminReplySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachmentUrl: z.string().trim().url().max(2000).optional(),
});
const listTicketsAdminQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'answered', 'closed']).optional(),
});

// --- Reviews ---
const listReviewsAdminQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

// --- Ads ---
const adCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['adsterra', 'adsense', 'banner']),
  placement: z.string().trim().min(1).max(100),
  code: z.string().trim().max(10000).optional().default(''),
  imageUrl: z.string().trim().url().nullable().optional(),
  linkUrl: z.string().trim().url().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});
const adUpdateSchema = adCreateSchema.partial();

// --- Settings ---
const settingsUpdateSchema = z.object({
  siteName: z.string().trim().max(100).optional(),
  siteTagline: z.string().trim().max(200).optional(),
  aboutContent: z.string().trim().max(5000).optional(),
  contactEmail: z.string().trim().email().or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  socialLinks: z
    .object({
      facebook: z.string().trim().max(300).optional(),
      twitter: z.string().trim().max(300).optional(),
      instagram: z.string().trim().max(300).optional(),
      whatsapp: z.string().trim().max(300).optional(),
      telegram: z.string().trim().max(300).optional(),
    })
    .optional(),
});

module.exports = {
  idParamsSchema,
  paginationQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  couponCreateSchema,
  couponUpdateSchema,
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
  listUsersQuerySchema,
  rejectOrderSchema,
  deliverOrderSchema,
  listOrdersAdminQuerySchema,
  adminReplySchema,
  listTicketsAdminQuerySchema,
  listReviewsAdminQuerySchema,
  adCreateSchema,
  adUpdateSchema,
  settingsUpdateSchema,
};
