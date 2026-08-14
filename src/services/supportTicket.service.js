const { SupportTicket } = require('../models/SupportTicket');
const { Order } = require('../models/Order');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { emitToAdmins, emitToUser } = require('./socket.service');
const { notifyUser, notifyAdmins } = require('./notification.service');
const { sendMail } = require('./email.service');
const { ticketAutoClosedEmail } = require('../utils/emailTemplates');
const { env } = require('../config/env');

// The related order, in the shape a ticket page needs: enough to recognise it and link to it,
// and nothing more. Stored since tickets began but never read back, so an operator opening a
// ticket about "my order" still had to go and find which one.
const RELATED_ORDER_FIELDS = 'orderNumber status currency total createdAt items.name items.quantity';

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

  await notifyAdmins({
    event: 'ticket:created',
    category: 'ticket',
    title: 'New support ticket',
    body: ticket.subject,
    link: `/admin/support/${ticket._id}`,
    meta: { ticketId: String(ticket._id) },
  });
  return ticket;
}

async function addMessage(userId, ticketId, { body, attachmentUrl }) {
  const ticket = await SupportTicket.findOne({ _id: ticketId, user: userId });
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  if (ticket.status === 'closed') throw new ApiError(400, 'This ticket is closed. Please open a new one.');

  ticket.messages.push({ sender: 'user', senderUser: userId, body, attachmentUrl: attachmentUrl || null });
  ticket.status = 'open';
  // The customer has answered, so the inactivity clock stops: only a ticket still waiting on
  // them can auto-close.
  ticket.lastAdminReplyAt = null;
  await ticket.save();

  await notifyAdmins({
    event: 'ticket:messageAdded',
    category: 'ticket',
    title: 'Customer replied to a ticket',
    body: ticket.subject,
    link: `/admin/support/${ticket._id}`,
    meta: { ticketId: String(ticket._id) },
  });
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
  const ticket = await SupportTicket.findOne({ _id: ticketId, user: userId })
    .populate('relatedOrder', RELATED_ORDER_FIELDS)
    .lean();
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  return ticket;
}

// A blocked user's session/tokens are revoked (auth.middleware rejects every authenticated
// request for a blocked account), so they can't use the normal authenticated ticket flow above.
// This is the one ticket-creation path that doesn't require requireAuth — it looks the user up by
// email instead, and only proceeds if that account is actually blocked.
async function createBlockAppeal({ email, message }) {
  const user = await User.findOne({ email });
  if (!user || !user.isBlocked) {
    throw new ApiError(400, 'No blocked account found for this email');
  }

  const ticket = await SupportTicket.create({
    user: user._id,
    subject: 'Account Block Appeal',
    category: 'block_appeal',
    status: 'open',
    messages: [
      {
        sender: 'user',
        senderUser: user._id,
        body: `Account blocked. Reason: ${user.blockReason || 'Not specified'}.\n\nUser's message: ${message}`,
      },
    ],
  });

  await notifyAdmins({
    event: 'ticket:created',
    category: 'ticket',
    title: 'Account block appeal submitted',
    body: email,
    link: `/admin/support/${ticket._id}`,
    meta: { ticketId: String(ticket._id), category: 'block_appeal' },
  });
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
  const ticket = await SupportTicket.findById(ticketId)
    .populate('user', 'email isBlocked blockReason')
    .populate('relatedOrder', RELATED_ORDER_FIELDS)
    .lean();
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  return ticket;
}

async function adminReply(adminUserId, ticketId, { body, attachmentUrl }) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  ticket.messages.push({ sender: 'admin', senderUser: adminUserId, body, attachmentUrl: attachmentUrl || null });
  ticket.status = 'answered';
  // Starts the inactivity clock the auto-close sweep measures against.
  ticket.lastAdminReplyAt = new Date();
  await ticket.save();

  await notifyUser(ticket.user, {
    event: 'ticket:messageAdded',
    category: 'ticket',
    title: 'Support replied to your ticket',
    body: ticket.subject,
    link: `/dashboard/tickets/${ticket._id}`,
    meta: { ticketId: String(ticket._id) },
  });
  return adminGetTicket(ticket._id);
}

async function adminCloseTicket(ticketId) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  ticket.status = 'closed';
  ticket.closedAt = new Date();
  ticket.closeReason = 'admin';
  ticket.lastAdminReplyAt = null;
  await ticket.save();

  await notifyUser(ticket.user, {
    event: 'ticket:closed',
    category: 'ticket',
    title: 'Your support ticket was closed',
    body: ticket.subject,
    link: `/dashboard/tickets/${ticket._id}`,
    meta: { ticketId: String(ticket._id) },
  });
  return adminGetTicket(ticket._id);
}

/**
 * Closes tickets the admin answered that the customer never came back to.
 *
 * Entirely server-side and idempotent: the filter only matches tickets still in 'answered' with
 * an admin reply older than the cutoff, and closing clears `lastAdminReplyAt`, so a ticket can
 * never be closed (or emailed about) twice. A customer reply clears the same field, which is
 * what makes "no response from the customer" the real condition rather than "no activity".
 */
async function autoCloseInactiveTickets() {
  const cutoff = new Date(Date.now() - env.ticketAutoCloseHours * 60 * 60 * 1000);
  const stale = await SupportTicket.find({
    status: 'answered',
    lastAdminReplyAt: { $ne: null, $lte: cutoff },
  }).populate('user', 'email name');

  for (const ticket of stale) {
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closeReason = 'auto_inactivity';
    ticket.lastAdminReplyAt = null;
    await ticket.save();

    if (ticket.user?.email) {
      await sendMail({
        to: ticket.user.email,
        subject: `Accvendor — support ticket closed: ${ticket.subject}`,
        html: ticketAutoClosedEmail(ticket, env.ticketAutoCloseHours),
      });
    }

    await notifyUser(ticket.user?._id || ticket.user, {
      event: 'ticket:closed',
      category: 'ticket',
      title: 'Support ticket closed automatically',
      body: `"${ticket.subject}" was closed after ${env.ticketAutoCloseHours} hours without a reply.`,
      link: `/dashboard/tickets/${ticket._id}`,
      meta: { ticketId: String(ticket._id), reason: 'auto_inactivity' },
    });
  }

  return stale.length;
}

module.exports = {
  createTicket,
  addMessage,
  getMyTickets,
  getTicketById,
  createBlockAppeal,
  adminListTickets,
  adminGetTicket,
  adminReply,
  adminCloseTicket,
  autoCloseInactiveTickets,
};
