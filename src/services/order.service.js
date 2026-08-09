const { Order } = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const PaymentMethod = require('../models/PaymentMethod');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { evaluateCoupon } = require('./coupon.service');
const { sendMail } = require('./email.service');
const { emitToAdmins, emitToUser } = require('./socket.service');
const { notifyUser, notifyAdmins } = require('./notification.service');
const { getRates } = require('./settings.service');
const { signCredentialToken } = require('../utils/token.util');
const { env } = require('../config/env');
const { withUniqueOrderNumber } = require('../utils/orderNumber');
const { priceInCurrency, toPkr, isCurrency, round, DEFAULT_CURRENCY } = require('../utils/money');
const {
  orderCreatedEmail,
  proofSubmittedEmail,
  orderApprovedEmail,
  orderRejectedEmail,
  orderDeliveredEmail,
  orderExpiredEmail,
  expiryReminderEmail,
  cancelRequestRejectedEmail,
  paymentReminderEmail,
  unpaidOrderExpiredEmail,
  orderCancelledEmail,
} = require('../utils/emailTemplates');

// --- Notification plumbing --------------------------------------------------------------

function orderLink(order) {
  return `/dashboard/orders/${order.orderNumber}`;
}

function adminOrderLink(order) {
  return `/admin/orders/${order._id}`;
}

/**
 * Emails the buyer, then records a persisted notification for both sides.
 *
 * Persisted first-class (not just a socket push) so nothing is lost when the recipient was
 * offline — see notification.service.js. Mail failures are already swallowed inside sendMail,
 * so a broken mailbox can never fail the transition that triggered it.
 */
async function notifyOrder(order, { subject, html, socketEvent, userTitle, userBody, adminTitle, category = 'order' }) {
  const user = await User.findById(order.user).lean();
  if (user && subject) {
    await sendMail({ to: user.email, subject, html });
  }

  if (userTitle) {
    await notifyUser(order.user, {
      event: socketEvent,
      category,
      title: userTitle,
      body: userBody || '',
      link: orderLink(order),
      meta: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
    });
  }

  if (adminTitle) {
    await notifyAdmins({
      event: socketEvent,
      category,
      title: adminTitle,
      body: `${order.orderNumber} — ${user?.email || 'unknown buyer'}`,
      link: adminOrderLink(order),
      meta: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status, userId: String(order.user) },
    });
  }
}

function credentialDownloadUrl(orderId, userId) {
  const token = signCredentialToken(orderId, userId);
  return `${env.apiUrl}/orders/${orderId}/credential?token=${token}`;
}

// --- Creation ----------------------------------------------------------------------------

/**
 * Resolves the lines of an order from server-side data only.
 *
 * The request names products, quantities and a currency — never a price. Every amount is looked
 * up from the Product document and the current Settings rates here, so a tampered client payload
 * cannot buy anything at a price the admin did not set.
 */
async function buildOrderItems(lines, currency, rates) {
  const products = await Product.find({
    _id: { $in: lines.map((l) => l.product) },
    isActive: true,
  });
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  for (const line of lines) {
    const product = productMap.get(String(line.product));
    if (!product) throw new ApiError(400, 'One of the items in your cart is no longer available');
    if (product.stock < line.quantity) {
      throw new ApiError(400, `"${product.name}" only has ${product.stock} left in stock`);
    }

    const resolved = priceInCurrency(product, currency, rates);
    items.push({
      product: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || null,
      unitPrice: resolved.effectivePrice,
      unitPricePKR: priceInCurrency(product, 'PKR', rates).effectivePrice,
      quantity: line.quantity,
      durationDays: product.durationDays,
      warranty: product.warranty || '',
      validity: product.validity || '',
    });
  }
  return items;
}

/**
 * Creates an order from the cart, or — when `buyNow` is supplied — from exactly one product.
 *
 * Buy Now deliberately does not read or clear the cart: it is an isolated purchase of the one
 * product the buyer clicked, and unrelated cart items must never be swept into it.
 */
async function createOrder(userId, { paymentMethodId, couponCode, idempotencyKey, currency, buyNow }) {
  // Idempotency is enforced by the unique (user, idempotencyKey) index; this read just turns
  // the common case (a double-clicked Place Order) into a fast, successful replay.
  const existing = await Order.findOne({ user: userId, idempotencyKey });
  if (existing) return existing;

  const rates = await getRates();
  const cur = isCurrency(currency) ? currency : rates.defaultCurrency || DEFAULT_CURRENCY;

  let lines;
  let fromCart = false;
  if (buyNow?.productId) {
    lines = [{ product: buyNow.productId, quantity: buyNow.quantity || 1 }];
  } else {
    const cart = await Cart.findOne({ user: userId });
    if (!cart || cart.items.length === 0) throw new ApiError(400, 'Your cart is empty');
    lines = cart.items.map((i) => ({ product: i.product, quantity: i.quantity }));
    fromCart = true;
  }

  const paymentMethod = await PaymentMethod.findOne({ _id: paymentMethodId, isActive: true });
  if (!paymentMethod) throw new ApiError(400, 'Selected payment method is not available');

  const orderItems = await buildOrderItems(lines, cur, rates);

  const subtotal = round(
    orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    cur
  );

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const result = await evaluateCoupon(couponCode, {
      items: orderItems.map((i) => ({ productId: i.product, unitPrice: i.unitPrice, quantity: i.quantity })),
      userId,
      currency: cur,
      rates,
    });
    coupon = result.coupon;
    discount = result.discount;
  }

  const total = Math.max(0, round(subtotal - discount, cur));
  const user = await User.findById(userId).select('email name').lean();

  // Optimistic stock reservation: only succeeds if stock hasn't changed since we read it above.
  const decremented = [];
  try {
    for (const item of orderItems) {
      const result = await Product.updateOne(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
      if (result.modifiedCount === 0) {
        throw new ApiError(409, `"${item.name}" just went out of stock, please update your cart`);
      }
      decremented.push(item);
    }

    if (coupon) {
      await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
    }

    const order = await withUniqueOrderNumber((orderNumber) =>
      Order.create({
        orderNumber,
        user: userId,
        userEmail: user?.email || null,
        userName: user?.name || null,
        items: orderItems,

        currency: cur,
        fxSnapshot: { usdRate: rates.usdRate, eurRate: rates.eurRate },
        subtotal,
        couponCode: coupon ? coupon.code : null,
        discount,
        total,
        subtotalPKR: toPkr(subtotal, cur, rates),
        discountPKR: toPkr(discount, cur, rates),
        totalPKR: toPkr(total, cur, rates),

        paymentMethod: {
          id: paymentMethod._id,
          name: paymentMethod.name,
          accountTitle: paymentMethod.accountTitle,
          accountNumber: paymentMethod.accountNumber,
          instructions: paymentMethod.instructions || '',
          qrImageUrl: paymentMethod.qrImageUrl || null,
        },
        status: 'pending_payment',
        // The clock the unpaid sweep enforces. Stored, not computed in the browser, so a
        // refresh cannot extend it.
        paymentDueAt: new Date(Date.now() + env.unpaidOrderWindowMinutes * 60 * 1000),
        idempotencyKey,
      })
    );

    // Only a cart-sourced order empties the cart. Buy Now leaves it exactly as it was.
    if (fromCart) {
      await Cart.updateOne({ user: userId }, { $set: { items: [] } });
    }

    await notifyOrder(order, {
      subject: 'Accvendor — order received',
      html: orderCreatedEmail(order),
      socketEvent: 'order:created',
      userTitle: `Order ${order.orderNumber} placed`,
      userBody: `Complete payment within ${env.unpaidOrderWindowMinutes} minutes to secure your order.`,
      adminTitle: 'New order placed',
    });

    return order;
  } catch (err) {
    // Roll back any stock we already decremented before the failure.
    for (const item of decremented) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
    }
    throw err;
  }
}

// --- Buyer-driven transitions -------------------------------------------------------------

async function submitProof(userId, orderId, proofUrl, transactionId) {
  const order = await findOwnedOrder(userId, orderId);
  if (!['pending_payment', 'proof_submitted'].includes(order.status)) {
    throw new ApiError(400, `Cannot submit payment proof for an order in "${order.status}" status`);
  }
  if (proofUrl) order.paymentProofUrl = proofUrl;
  if (transactionId) order.paymentTransactionId = transactionId;
  order.status = 'proof_submitted';
  // Payment has been reported: the unpaid clock no longer applies and the sweep must skip it.
  order.paymentDueAt = null;
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — payment proof received',
    html: proofSubmittedEmail(order),
    socketEvent: 'order:proofSubmitted',
    userTitle: `Payment proof received for ${order.orderNumber}`,
    userBody: 'We are verifying your payment and will update you shortly.',
    adminTitle: 'Payment proof submitted',
    category: 'payment',
  });

  return order;
}

/**
 * Opens a cancellation request. Exactly one is allowed per order, ever: any status other than
 * 'none' is terminal for the customer, including a rejection — otherwise a declined request
 * would hand them an unlimited retry loop.
 */
async function requestCancellation(userId, orderId, reason) {
  const order = await findOwnedOrder(userId, orderId);
  if (order.status !== 'delivered') {
    throw new ApiError(400, 'Only active (delivered) subscriptions can be cancelled');
  }

  const current = order.cancelRequest?.status || 'none';
  if (current === 'pending') throw new ApiError(409, 'A cancellation request is already pending for this order');
  if (current === 'approved') throw new ApiError(409, 'This order has already been cancelled');
  if (current === 'rejected') {
    throw new ApiError(
      409,
      'A cancellation request for this order was already reviewed and declined. Please open a support ticket if you need further help.'
    );
  }

  order.cancelRequest = { status: 'pending', reason: reason || null, requestedAt: new Date() };
  await order.save();

  await notifyOrder(order, {
    subject: null,
    socketEvent: 'order:cancelRequested',
    userTitle: `Cancellation requested for ${order.orderNumber}`,
    userBody: 'Our team will review your request.',
    adminTitle: 'Cancellation requested',
    category: 'cancellation',
  });

  return order;
}

// --- Admin-driven transitions ---------------------------------------------------------------

async function markUnderReview(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'proof_submitted') {
    throw new ApiError(400, `Cannot start review for an order in "${order.status}" status`);
  }
  order.status = 'under_review';
  await order.save();
  emitToAdmins('order:statusChanged', { orderId: String(order._id), status: order.status });
  await notifyUser(order.user, {
    event: 'order:statusChanged',
    category: 'order',
    title: `Order ${order.orderNumber} is under review`,
    link: orderLink(order),
    meta: { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status },
  });
  return order;
}

async function approveOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['proof_submitted', 'under_review'].includes(order.status)) {
    throw new ApiError(400, `Cannot approve an order in "${order.status}" status`);
  }
  order.status = 'approved';
  order.paymentDueAt = null;
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — payment approved',
    html: orderApprovedEmail(order),
    socketEvent: 'order:statusChanged',
    userTitle: `Payment approved for ${order.orderNumber}`,
    userBody: 'Your credentials will be delivered shortly.',
    category: 'payment',
  });

  return order;
}

async function rejectOrder(orderId, reason) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['proof_submitted', 'under_review'].includes(order.status)) {
    throw new ApiError(400, `Cannot reject an order in "${order.status}" status`);
  }
  order.status = 'rejected';
  order.rejectionReason = reason || null;
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — payment could not be verified',
    html: orderRejectedEmail(order),
    socketEvent: 'order:statusChanged',
    userTitle: `Payment could not be verified for ${order.orderNumber}`,
    userBody: reason || 'Please contact support for details.',
    category: 'payment',
  });

  return order;
}

async function deliverOrder(orderId, { credentialFileUrl, credentialText, expiresAt }) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'approved') {
    throw new ApiError(400, `Cannot deliver an order in "${order.status}" status`);
  }
  order.credentialFileUrl = credentialFileUrl || null;
  order.credentialText = credentialText || null;
  order.expiresAt = expiresAt || null;
  order.status = 'delivered';
  await order.save();

  const downloadUrl = credentialFileUrl ? credentialDownloadUrl(order._id, order.user) : null;
  await notifyOrder(order, {
    subject: 'Accvendor — your order is ready',
    html: orderDeliveredEmail(order, downloadUrl),
    socketEvent: 'order:statusChanged',
    userTitle: `Order ${order.orderNumber} delivered`,
    userBody: 'Your account details are ready in your dashboard.',
  });

  return order;
}

async function cancelOrder(orderId, adminId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.cancelRequest?.status !== 'pending') {
    throw new ApiError(400, 'This order has no pending cancellation request');
  }
  order.status = 'cancelled';
  order.cancelRequest.status = 'approved';
  order.cancelRequest.decidedAt = new Date();
  order.cancelRequest.decidedBy = adminId || null;
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — order cancelled',
    html: orderCancelledEmail(order),
    socketEvent: 'order:statusChanged',
    userTitle: `Order ${order.orderNumber} cancelled`,
    userBody: 'Your cancellation request was approved.',
    category: 'cancellation',
  });

  return order;
}

async function rejectCancelRequest(orderId, reason, adminId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.cancelRequest?.status !== 'pending') {
    throw new ApiError(400, 'This order has no pending cancellation request');
  }
  order.cancelRequest.status = 'rejected';
  order.cancelRequest.rejectionReason = reason;
  order.cancelRequest.decidedAt = new Date();
  order.cancelRequest.decidedBy = adminId || null;
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — cancellation request declined',
    html: cancelRequestRejectedEmail(order),
    socketEvent: 'order:cancelRejected',
    userTitle: `Cancellation declined for ${order.orderNumber}`,
    userBody: reason,
    category: 'cancellation',
  });

  return order;
}

/** Admin-triggered nudge for an order that is still awaiting payment. */
async function sendPaymentReminder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'pending_payment') {
    throw new ApiError(400, 'Payment reminders only apply to orders that are still unpaid');
  }

  const user = await User.findById(order.user).lean();
  if (!user) throw new ApiError(404, 'Buyer account not found');

  await sendMail({
    to: user.email,
    subject: `Accvendor — payment reminder for ${order.orderNumber}`,
    html: paymentReminderEmail(order),
  });

  order.paymentReminderSentAt = new Date();
  await order.save();

  await notifyUser(order.user, {
    event: 'order:paymentReminder',
    category: 'payment',
    title: `Payment still pending for ${order.orderNumber}`,
    body: 'Complete your payment to secure this order.',
    link: orderLink(order),
    meta: { orderId: String(order._id), orderNumber: order.orderNumber },
  });

  return order;
}

// --- Reads ---------------------------------------------------------------------------------

/**
 * Looks an order up by database id *or* order number, always constrained to its owner.
 *
 * Ownership is part of the query rather than a check afterwards, so a customer asking for
 * someone else's order gets a plain 404 and no information about whether it exists.
 */
function ownedOrderQuery(userId, idOrNumber) {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(idOrNumber));
  return isObjectId
    ? { _id: idOrNumber, user: userId }
    : { orderNumber: String(idOrNumber).toUpperCase(), user: userId };
}

async function findOwnedOrder(userId, idOrNumber) {
  const order = await Order.findOne(ownedOrderQuery(userId, idOrNumber));
  if (!order) throw new ApiError(404, 'Order not found');
  return order;
}

/** Case-insensitive match across order number, buyer email and buyer name. */
function searchClause(search) {
  const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(escaped, 'i');
  return [{ orderNumber: rx }, { userEmail: rx }, { userName: rx }, { 'items.name': rx }];
}

async function getMyOrders(userId, { page, limit, status, search }) {
  const filter = { user: userId };
  if (status) filter.status = status;
  // Scoped by `user` first, so a customer's search can only ever traverse their own orders.
  if (search) filter.$or = searchClause(search);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function getOrderById(userId, idOrNumber) {
  const order = await Order.findOne(ownedOrderQuery(userId, idOrNumber)).lean();
  if (!order) throw new ApiError(404, 'Order not found');
  return order;
}

async function adminListOrders({ page, limit, status, search }) {
  const filter = {};
  if (status) filter.status = status;
  if (search) filter.$or = searchClause(search);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'email name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminListCancelRequests({ page, limit }) {
  const filter = { 'cancelRequest.status': 'pending' };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'email name').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminGetOrder(orderId) {
  const order = await Order.findById(orderId).populate('user', 'email name').lean();
  if (!order) throw new ApiError(404, 'Order not found');
  return order;
}

async function getCredentialDownloadUrl(userId, idOrNumber) {
  const order = await Order.findOne(ownedOrderQuery(userId, idOrNumber)).lean();
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'delivered' || !order.credentialFileUrl) {
    throw new ApiError(400, 'Credentials are not available for this order yet');
  }
  return credentialDownloadUrl(order._id, order.user);
}

async function resolveCredentialDownload(orderId, userId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'delivered' || !order.credentialFileUrl) {
    throw new ApiError(404, 'Credentials are not available for this order');
  }
  return order.credentialFileUrl;
}

// --- Cron-driven lifecycle -------------------------------------------------------------------

/**
 * Expires orders that were never paid for inside the payment window.
 *
 * Server-side and idempotent: the filter only matches orders still sitting in pending_payment
 * with an elapsed due date, and the first thing the transition does is clear that due date.
 */
async function expireUnpaidOrders() {
  const now = new Date();
  const due = await Order.find({ status: 'pending_payment', paymentDueAt: { $ne: null, $lte: now } });

  for (const order of due) {
    order.status = 'expired';
    order.expiredReason = 'unpaid';
    order.paymentDueAt = null;
    await order.save();

    // Return the stock the unpaid order was holding.
    for (const item of order.items) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
    }

    await notifyOrder(order, {
      subject: `Accvendor — order ${order.orderNumber} expired`,
      html: unpaidOrderExpiredEmail(order),
      socketEvent: 'order:statusChanged',
      userTitle: `Order ${order.orderNumber} expired`,
      userBody: 'Payment was not completed in time. You can place the order again.',
      category: 'payment',
    });
  }
  return due.length;
}

async function markExpiredOrders() {
  const now = new Date();
  const toExpire = await Order.find({ status: 'delivered', expiresAt: { $lte: now } });
  for (const order of toExpire) {
    order.status = 'expired';
    order.expiredReason = 'subscription';
    await order.save();
    await notifyOrder(order, {
      subject: 'Accvendor — subscription expired',
      html: orderExpiredEmail(order),
      socketEvent: 'order:statusChanged',
      userTitle: `Subscription expired for ${order.orderNumber}`,
      userBody: 'Renew to keep your access active.',
    });
  }
  return toExpire.length;
}

async function sendExpiryReminders() {
  const now = new Date();
  const reminderWindowEnd = new Date(now.getTime() + env.expiryReminderDaysBefore * 24 * 60 * 60 * 1000);
  const candidates = await Order.find({
    status: 'delivered',
    expiresAt: { $gt: now, $lte: reminderWindowEnd },
    expiryReminderSentAt: null,
  });

  for (const order of candidates) {
    const daysLeft = Math.max(1, Math.ceil((order.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    const user = await User.findById(order.user).lean();
    if (user) {
      await sendMail({
        to: user.email,
        subject: 'Accvendor — your subscription is expiring soon',
        html: expiryReminderEmail(order, daysLeft),
      });
    }
    order.expiryReminderSentAt = now;
    await order.save();
  }
  return candidates.length;
}

module.exports = {
  createOrder,
  submitProof,
  getMyOrders,
  getOrderById,
  markUnderReview,
  approveOrder,
  rejectOrder,
  deliverOrder,
  sendPaymentReminder,
  getCredentialDownloadUrl,
  resolveCredentialDownload,
  markExpiredOrders,
  expireUnpaidOrders,
  sendExpiryReminders,
  requestCancellation,
  cancelOrder,
  rejectCancelRequest,
  adminListOrders,
  adminListCancelRequests,
  adminGetOrder,
};
