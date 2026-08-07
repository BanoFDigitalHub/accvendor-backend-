const { z } = require('zod');

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

module.exports = { subscribeSchema };
