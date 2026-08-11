const { z } = require('zod');
const { LEAD_PROGRAMS } = require('../models/Lead');
const { paginationQuerySchema } = require('./admin.validator');

// A public, unauthenticated form, so everything is bounded: an open text field with no maximum
// is an invitation to post a novel into the admin's inbox.
const leadInterestSchema = z.object({
  program: z.enum(LEAD_PROGRAMS),
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  phone: z.string().trim().max(40).optional().default(''),
  details: z.string().trim().max(2000).optional().default(''),
});

const listLeadsQuerySchema = paginationQuerySchema.extend({
  program: z.enum(LEAD_PROGRAMS).optional(),
  search: z.string().trim().max(120).optional(),
});

const exportLeadsQuerySchema = z.object({
  program: z.enum(LEAD_PROGRAMS).optional(),
});

const updateLeadSchema = z.object({
  contactedAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

module.exports = { leadInterestSchema, listLeadsQuerySchema, exportLeadsQuerySchema, updateLeadSchema };
