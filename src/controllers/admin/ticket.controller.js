const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const ticketService = require('../../services/supportTicket.service');

const list = asyncHandler(async (req, res) => {
  const result = await ticketService.adminListTickets(req.query);
  apiResponse(res, 200, 'Tickets fetched', {
    tickets: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const detail = asyncHandler(async (req, res) => {
  const ticket = await ticketService.adminGetTicket(req.params.id);
  apiResponse(res, 200, 'Ticket fetched', { ticket });
});

const reply = asyncHandler(async (req, res) => {
  const ticket = await ticketService.adminReply(req.user._id, req.params.id, req.body);
  apiResponse(res, 200, 'Reply sent', { ticket });
});

const close = asyncHandler(async (req, res) => {
  const ticket = await ticketService.adminCloseTicket(req.params.id);
  apiResponse(res, 200, 'Ticket closed', { ticket });
});

module.exports = { list, detail, reply, close };
