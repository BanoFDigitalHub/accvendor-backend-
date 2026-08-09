const { z } = require('zod');

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  // 'latest' is the bell dropdown's view — same ordering as 'all', just a short page.
  filter: z.enum(['all', 'latest', 'unread', 'read']).optional().default('all'),
});

const notificationIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

module.exports = { listNotificationsQuerySchema, notificationIdParamsSchema };
