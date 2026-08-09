const { z } = require('zod');
const { REVIEW_TAGS } = require('../models/Review');

const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1, 'Please write a short review').max(2000),
  // Tap-to-add suggestion tags. Constrained to the server's fixed list so the stored values
  // stay a closed set the product page can aggregate on.
  tags: z.array(z.enum(REVIEW_TAGS)).max(4).optional().default([]),
});

const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

module.exports = { slugParamSchema, createReviewSchema, listReviewsQuerySchema, REVIEW_TAGS };
