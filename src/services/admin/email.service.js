const { Order } = require('../../models/Order');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const { sendMail } = require('../email.service');
const { notifyUser } = require('../notification.service');
const { adminMessageEmail } = require('../../utils/emailTemplates');

/**
 * Sends a free-form admin message to a customer.
 *
 * The recipient address always comes from the account record, never from the request — the
 * admin chooses *who* by picking an order or a user, not by typing an address, so this
 * endpoint cannot be used to send mail to an arbitrary third party.
 */
async function emailUser(userId, { subject, message }, admin, context = {}) {
  const user = await User.findById(userId).select('email name').lean();
  if (!user) throw new ApiError(404, 'Customer not found');

  const sent = await sendMail({
    to: user.email,
    subject,
    html: adminMessageEmail({ subject, message, recipientName: user.name, ...context }),
  });

  await notifyUser(userId, {
    event: 'account:message',
    category: 'account',
    title: subject,
    body: message.slice(0, 160),
    link: context.orderNumber ? `/dashboard/orders/${context.orderNumber}` : '/dashboard',
    meta: { from: admin?.email || 'support', ...context },
  });

  return { to: user.email, delivered: sent !== false };
}

async function emailOrderCustomer(orderId, body, admin) {
  const order = await Order.findById(orderId).select('user orderNumber').lean();
  if (!order) throw new ApiError(404, 'Order not found');
  return emailUser(order.user, body, admin, { orderNumber: order.orderNumber });
}

module.exports = { emailUser, emailOrderCustomer };
