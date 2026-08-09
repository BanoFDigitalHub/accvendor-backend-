const { z } = require('zod');
const { AD_TYPES, AD_PLACEMENTS, AD_DEVICES, AD_FREQUENCIES } = require('../models/Ad');
const { ORDER_STATUSES } = require('../models/Order');
const { partialUpdateSchema } = require('./partialUpdate');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const idParamsSchema = z.object({ id: objectId });

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// --- Products ---
const productImageSchema = z.object({
  url: z.string().trim().url().max(2000),
  publicId: z.string().trim().max(300).nullable().optional(),
});

const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().trim().min(1).max(5000),
  // Either shape is accepted: `media` when the admin uploaded through Cloudinary (so we hold
  // the publicId and can destroy the asset later), `images` for plain pasted URLs.
  media: z.array(productImageSchema).max(10).optional(),
  images: z.array(z.string().trim().url()).max(10).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(6).optional().default([]),
  category: objectId,

  // One authoritative amount per currency. PKR (`price`) is required; USD/EUR are optional and
  // fall back to the Settings conversion rate when left null.
  price: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0).nullable().optional(),
  usdPrice: z.coerce.number().min(0).nullable().optional(),
  usdSalePrice: z.coerce.number().min(0).nullable().optional(),
  eurPrice: z.coerce.number().min(0).nullable().optional(),
  eurSalePrice: z.coerce.number().min(0).nullable().optional(),

  durationDays: z.coerce.number().int().min(1),
  warranty: z.string().trim().max(100).optional().default(''),
  validity: z.string().trim().max(100).optional().default(''),
  stock: z.coerce.number().int().min(0),
  isHotProduct: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});
const productUpdateSchema = partialUpdateSchema(productCreateSchema);

const listProductsAdminQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});

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
const categoryUpdateSchema = partialUpdateSchema(categoryCreateSchema);

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
const couponUpdateSchema = partialUpdateSchema(couponCreateSchema);

// --- Payment Methods ---
const paymentMethodCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['mobile_wallet', 'bank', 'crypto', 'other']),
  accountTitle: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(2000).optional().default(''),
  qrImageUrl: z.string().trim().url().max(2000).nullable().optional(),
  qrImagePublicId: z.string().trim().max(300).nullable().optional(),
  logoUrl: z.string().trim().url().max(2000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});
const paymentMethodUpdateSchema = partialUpdateSchema(paymentMethodCreateSchema);

// --- Users ---
const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});
const blockUserSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required').max(500),
});

// --- Orders ---
const rejectOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
const rejectCancelRequestSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required').max(500),
});
const deliverOrderSchema = z
  .object({
    credentialFileUrl: z.string().trim().url().max(2000).optional(),
    credentialText: z.string().trim().min(1).max(5000).optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((data) => data.credentialFileUrl || data.credentialText, {
    message: 'Provide a credential file, credential text, or both',
    path: ['credentialText'],
  });
const listOrdersAdminQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  // Matches order number, buyer email, or buyer name. Applied server-side against the indexed
  // fields so it works across the whole collection, not just the page currently loaded.
  search: z.string().trim().max(200).optional(),
});

// Admin -> customer freeform email, sent from an order or a user record.
const manualEmailSchema = z.object({
  subject: z.string().trim().min(1, 'A subject is required').max(200),
  message: z.string().trim().min(1, 'A message is required').max(5000),
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
// Kept as a plain object so both the create and the update variant can derive from it —
// `.partial()` is not available once a schema has been wrapped by `.refine()`.
const adBaseSchema = z.object({
    name: z.string().trim().min(1).max(200),
    type: z.enum(AD_TYPES).optional().default('banner'),
    placement: z.enum(AD_PLACEMENTS),

    title: z.string().trim().max(200).optional().default(''),
    description: z.string().trim().max(1000).optional().default(''),
    ctaLabel: z.string().trim().max(60).optional().default(''),
    imageUrl: z.string().trim().url().max(2000).nullable().optional(),
    imagePublicId: z.string().trim().max(300).nullable().optional(),
    linkUrl: z.string().trim().url().max(2000).nullable().optional(),
    code: z.string().trim().max(10000).optional().default(''),

    priority: z.coerce.number().int().min(0).max(1000).optional().default(0),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    devices: z.array(z.enum(AD_DEVICES)).min(1).optional().default([...AD_DEVICES]),
    isActive: z.boolean().optional().default(true),

    popup: z
      .object({
        delaySeconds: z.coerce.number().int().min(0).max(120).optional().default(6),
        frequency: z.enum(AD_FREQUENCIES).optional().default('session'),
        cooldownHours: z.coerce.number().int().min(0).max(24 * 90).optional().default(24),
        dismissible: z.boolean().optional().default(true),
      })
      .optional(),

  sortOrder: z.coerce.number().int().optional().default(0),
});

const datesOrdered = (d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt;
const dateOrderIssue = { message: 'End date must be after the start date', path: ['endsAt'] };

const adCreateSchema = adBaseSchema
  .refine(datesOrdered, dateOrderIssue)
  // A network ad is its embed code; a banner/popup is its creative. Catching this here means
  // the storefront never has to render an ad that has nothing to show.
  .refine((d) => (['adsterra', 'adsense'].includes(d.type) ? Boolean(d.code) : Boolean(d.imageUrl || d.title)), {
    message: 'Provide embed code for a network ad, or an image/title for a banner or popup',
    path: ['imageUrl'],
  });

// The creative check is deliberately absent here: a partial update may legitimately send only
// a priority or an isActive flag, with no creative fields at all.
const adUpdateSchema = partialUpdateSchema(adBaseSchema).refine(datesOrdered, dateOrderIssue);

const listAdsAdminQuerySchema = paginationQuerySchema.extend({
  placement: z.enum(AD_PLACEMENTS).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

// --- Audit log ---
const deleteAuditLogSchema = z.object({
  ids: z.array(objectId).min(1),
});

// --- Settings ---
const ratingProviderSchema = z.object({
  provider: z.string().trim().min(1).max(60),
  rating: z.coerce.number().min(0).max(5),
  reviewCount: z.coerce.number().int().min(0),
  url: z.string().trim().max(500).optional().default(''),
  accent: z.string().trim().max(30).optional().default('#f5b301'),
  isActive: z.boolean().optional().default(true),
});

const trustBadgeSchema = z.object({
  label: z.string().trim().min(1).max(80),
  sublabel: z.string().trim().max(120).optional().default(''),
  iconUrl: z.string().trim().max(2000).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

const statSchema = z.object({
  value: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(60),
  isActive: z.boolean().optional().default(true),
});

const testimonialSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(120).optional().default(''),
  avatarUrl: z.string().trim().max(2000).optional().default(''),
  rating: z.coerce.number().int().min(1).max(5).optional().default(5),
  quote: z.string().trim().min(1).max(1000),
  source: z.string().trim().max(60).optional().default(''),
  isSeed: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

const settingsUpdateSchema = z.object({
  siteName: z.string().trim().max(100).optional(),
  siteTagline: z.string().trim().max(200).optional(),
  aboutContent: z.string().trim().max(5000).optional(),
  contactEmail: z.string().trim().email().or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  usdRate: z.coerce.number().positive().optional(),
  eurRate: z.coerce.number().positive().optional(),
  defaultCurrency: z.enum(['PKR', 'USD', 'EUR']).optional(),
  socialLinks: z
    .object({
      facebook: z.string().trim().max(300).optional(),
      twitter: z.string().trim().max(300).optional(),
      instagram: z.string().trim().max(300).optional(),
      whatsapp: z.string().trim().max(300).optional(),
      telegram: z.string().trim().max(300).optional(),
      discord: z.string().trim().max(300).optional(),
    })
    .optional(),
  trust: z
    .object({
      ratingProviders: z.array(ratingProviderSchema).max(6).optional(),
      badges: z.array(trustBadgeSchema).max(8).optional(),
      stats: z.array(statSchema).max(8).optional(),
      testimonials: z.array(testimonialSchema).max(24).optional(),
      reviewsHeading: z.string().trim().max(160).optional(),
      allReviewsUrl: z.string().trim().max(500).optional(),
    })
    .optional(),
  footer: z
    .object({
      copyrightYear: z.string().trim().max(9).optional(),
      creditName: z.string().trim().max(100).optional(),
      creditUrl: z.string().trim().max(300).optional(),
    })
    .optional(),
});

module.exports = {
  idParamsSchema,
  paginationQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  listProductsAdminQuerySchema,
  listAdsAdminQuerySchema,
  manualEmailSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  couponCreateSchema,
  couponUpdateSchema,
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
  listUsersQuerySchema,
  blockUserSchema,
  rejectOrderSchema,
  rejectCancelRequestSchema,
  deliverOrderSchema,
  listOrdersAdminQuerySchema,
  adminReplySchema,
  listTicketsAdminQuerySchema,
  listReviewsAdminQuerySchema,
  adCreateSchema,
  adUpdateSchema,
  settingsUpdateSchema,
  deleteAuditLogSchema,
};
