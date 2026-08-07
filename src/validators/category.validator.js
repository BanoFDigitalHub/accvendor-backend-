const { z } = require('zod');

const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(100),
});

module.exports = { slugParamSchema };
