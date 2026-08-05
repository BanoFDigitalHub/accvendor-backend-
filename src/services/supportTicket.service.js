const { SupportTicket } = require('../models/SupportTicket');
const { Order } = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { emitToAdmins, emitToUser } = require('./socket.service');

async function createTicket(userId, { subject, body, attachmentUrl, orderId }) {
  if (orderId) {
    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    if (!order) throw new ApiError(404, 'Order not found');
  }

  const ticket = await SupportTicket.create({
    user: userId,
    subject,
    relatedOrder: orderId || null,
    status: 'open',
    messages: [{ sender: 'user', senderUser: userId, body, attachmentUrl: attachmentUrl || null }],
  });

  emitToAdmins('ticket:created', { ticketId: String(ticket._id), subject: ticket.subject });
  return ticket;
}

async function addMessage(userId, ticketId, { body, attachmentUrl }) {
  const ticket = await SupportTicket.findOne({ _id: ticketId, user: userId });
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  if (ticket.status === 'closed') throw new ApiError(400, 'This ticket is closed. Please open a new one.');

  ticket.messages.push({ sender: 'user', senderUser: userId, body, attachmentUrl: attachmentUrl || null });
  ticket.status = 'open';
  await ticket.save();

  emitToAdmins('ticket:messageAdded', { ticketId: String(ticket._id), subject: ticket.subject });
  return ticket;
}

async function getMyTickets(userId, { page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SupportTicket.find({ user: userId }).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    SupportTicket.countDocuments({ user: userId }),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function getTicketById(userId, ticketId) {
  const ticket = await SupportTicket.findOne({ _id: ticketId, user: userId }).lean();
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  return ticket;
}

// --- Admin-facing (support desk) ---

async function adminListTickets({ page, limit, status }) {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SupportTicket.find(filter).populate('user', 'email').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    SupportTicket.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminGetTicket(ticketId) {
  const ticket = await SupportTicket.findById(ticketId).populate('user', 'email').lean();
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  return ticket;
}

async function adminReply(adminUserId, ticketId, { body, attachmentUrl }) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  ticket.messages.push({ sender: 'admin', senderUser: adminUserId, body, attachmentUrl: attachmentUrl || null });
  ticket.status = 'answered';
  await ticket.save();
  emitToUser(ticket.user, 'ticket:messageAdded', { ticketId: String(ticket._id) });
  return adminGetTicket(ticket._id);
}

async function adminCloseTicket(ticketId) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  ticket.status = 'closed';
  await ticket.save();
  emitToUser(ticket.user, 'ticket:messageAdded', { ticketId: String(ticket._id) });
  return adminGetTicket(ticket._id);
}

module.exports = {
  createTicket,
  addMessage,
  getMyTickets,
  getTicketById,
  adminListTickets,
  adminGetTicket,
  adminReply,
  adminCloseTicket,
};
