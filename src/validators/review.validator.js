const { z } = require('zod');

const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1, 'Comment is required').max(2000),
});

const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

module.exports = { slugParamSchema, createReviewSchema, listReviewsQuerySchema };
