const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const createTicketSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  body: z.string().trim().min(1, 'Message is required').max(4000),
  attachmentUrl: z.string().trim().url().max(2000).optional(),
  orderId: objectId.optional(),
});

const addMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message is required').max(4000),
  attachmentUrl: z.string().trim().url().max(2000).optional(),
});

const ticketIdParamsSchema = z.object({
  id: objectId,
});

const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

module.exports = {
  createTicketSchema,
  addMessageSchema,
  ticketIdParamsSchema,
  listTicketsQuerySchema,
};
