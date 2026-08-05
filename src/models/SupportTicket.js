const mongoose = require('mongoose');

const TICKET_STATUSES = ['open', 'answered', 'closed'];

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
    messages: { type: [messageSchema], required: true, validate: (v) => v.length > 0 },
  },
  { timestamps: true }
);

supportTicketSchema.index({ user: 1, createdAt: -1 });

module.exports = { SupportTicket: mongoose.model('SupportTicket', supportTicketSchema), TICKET_STATUSES };
