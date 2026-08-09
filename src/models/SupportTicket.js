const mongoose = require('mongoose');

const TICKET_STATUSES = ['open', 'answered', 'closed'];
const TICKET_CATEGORIES = ['general', 'block_appeal'];
const TICKET_CLOSE_REASONS = ['admin', 'user', 'auto_inactivity'];

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ['user', 'admin'], required: true },
    senderUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    attachmentUrl: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },
    // 'block_appeal' tickets are created by the public /auth/block-appeal endpoint (no session
    // required, since a blocked user's tokens are revoked) — flagged so the admin support desk
    // can surface the block context inline instead of the admin having to piece it together.
    category: { type: String, enum: TICKET_CATEGORIES, default: 'general' },
    messages: { type: [messageSchema], required: true, validate: (v) => v.length > 0 },

    // --- Auto-close ------------------------------------------------------------------
    // Set every time an admin replies and cleared the moment the customer answers, so it means
    // exactly "answered, and still waiting on the customer since". The inactivity job closes
    // tickets whose value is older than env.ticketAutoCloseHours — server-side, never a timer
    // in the browser.
    lastAdminReplyAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, enum: TICKET_CLOSE_REASONS, default: null },
  },
  { timestamps: true }
);

supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });
// Drives the auto-close sweep: only 'answered' tickets awaiting a customer reply are scanned.
supportTicketSchema.index({ status: 1, lastAdminReplyAt: 1 });

module.exports = {
  SupportTicket: mongoose.model('SupportTicket', supportTicketSchema),
  TICKET_STATUSES,
  TICKET_CATEGORIES,
  TICKET_CLOSE_REASONS,
};
