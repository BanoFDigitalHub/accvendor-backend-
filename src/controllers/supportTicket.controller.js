const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ticketService = require('../services/supportTicket.service');

const create = asyncHandler(async (req, res) => {
  const ticket = await ticketService.createTicket(req.user._id, req.body);
  apiResponse(res, 201, 'Support ticket created', { ticket });
});

const addMessage = asyncHandler(async (req, res) => {
  const ticket = await ticketService.addMessage(req.user._id, req.params.id, req.body);
  apiResponse(res, 200, 'Message added', { ticket });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await ticketService.getMyTickets(req.user._id, { page, limit });
  apiResponse(res, 200, 'Tickets fetched', {
    tickets: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

// Lets the "new ticket" page show the thread the customer already has instead of a form that is
// going to 409. The rule itself is enforced in createTicket — this is only how the UI finds out
// about it before spending someone's typing.
const liveTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.findLiveTicket(req.user._id);
  apiResponse(res, 200, ticket ? 'Open ticket found' : 'No open ticket', { ticket: ticket || null });
});

const detail = asyncHandler(async (req, res) => {
  const ticket = await ticketService.getTicketById(req.user._id, req.params.id);
  apiResponse(res, 200, 'Ticket fetched', { ticket });
});

module.exports = { create, addMessage, list, detail, liveTicket };
