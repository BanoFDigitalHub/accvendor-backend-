const express = require('express');
const controller = require('../controllers/supportTicket.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const {
  createTicketSchema,
  addMessageSchema,
  ticketIdParamsSchema,
  listTicketsQuerySchema,
} = require('../validators/supportTicket.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: listTicketsQuerySchema }), controller.list);
router.post('/', validate({ body: createTicketSchema }), controller.create);
router.get('/:id', validate({ params: ticketIdParamsSchema }), controller.detail);
router.post(
  '/:id/messages',
  validate({ params: ticketIdParamsSchema, body: addMessageSchema }),
  controller.addMessage
);

module.exports = router;
