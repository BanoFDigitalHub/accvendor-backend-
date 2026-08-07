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
const { signCredentialToken } = require('../utils/token.util');
const { env } = require('../config/env');
const {
  orderCreatedEmail,
  proofSubmittedEmail,
  orderApprovedEmail,
  orderRejectedEmail,
  orderDeliveredEmail,
  orderExpiredEmail,
  expiryReminderEmail,
  cancelRequestRejectedEmail,
} = require('../utils/emailTemplates');

async function notifyOrder(order, { subject, html, socketEvent }) {
  const user = await User.findById(order.user).lean();
  if (user) {
    await sendMail({ to: user.email, subject, html });
  }
  emitToUser(order.user, socketEvent, { orderId: String(order._id), status: order.status });
  emitToAdmins(socketEvent, { orderId: String(order._id), status: order.status, userId: String(order.user) });
}

function credentialDownloadUrl(orderId, userId) {
  const token = signCredentialToken(orderId, userId);
  return `${env.apiUrl}/orders/${orderId}/credential?token=${token}`;
}

async function createOrder(userId, { paymentMethodId, couponCode, idempotencyKey }) {
  const existing = await Order.findOne({ user: userId, idempotencyKey });
  if (existing) return existing;

  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, 'Your cart is empty');
  }

  const paymentMethod = await PaymentMethod.findOne({ _id: paymentMethodId, isActive: true });
  if (!paymentMethod) throw new ApiError(400, 'Selected payment method is not available');

  const products = await Product.find({
    _id: { $in: cart.items.map((i) => i.product) },
    isActive: true,
  });
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const orderItems = [];
  for (const cartItem of cart.items) {
    const product = productMap.get(String(cartItem.product));
    if (!product) throw new ApiError(400, 'One of the items in your cart is no longer available');
    if (product.stock < cartItem.quantity) {
      throw new ApiError(400, `"${product.name}" only has ${product.stock} left in stock`);
    }
    const unitPrice = product.salePrice != null ? product.salePrice : product.price;
    orderItems.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0] || null,
      unitPrice,
      quantity: cartItem.quantity,
      durationDays: product.durationDays,
    });
  }

  const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const result = await evaluateCoupon(couponCode, {
      items: orderItems.map((i) => ({ productId: i.product, unitPrice: i.unitPrice, quantity: i.quantity })),
      userId,
    });
    coupon = result.coupon;
    discount = result.discount;
  }

  const total = Math.max(0, subtotal - discount);

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

    const order = await Order.create({
      user: userId,
      items: orderItems,
      subtotal,
      couponCode: coupon ? coupon.code : null,
      discount,
      total,
      paymentMethod: {
        id: paymentMethod._id,
        name: paymentMethod.name,
        accountTitle: paymentMethod.accountTitle,
        accountNumber: paymentMethod.accountNumber,
      },
      status: 'pending_payment',
      idempotencyKey,
    });

    cart.items = [];
    await cart.save();

    await notifyOrder(order, {
      subject: 'Accvendor — order received',
      html: orderCreatedEmail(order),
      socketEvent: 'order:created',
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

async function submitProof(userId, orderId, proofUrl, transactionId) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['pending_payment', 'proof_submitted'].includes(order.status)) {
    throw new ApiError(400, `Cannot submit payment proof for an order in "${order.status}" status`);
  }
  if (proofUrl) order.paymentProofUrl = proofUrl;
  if (transactionId) order.paymentTransactionId = transactionId;
  order.status = 'proof_submitted';
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — payment proof received',
    html: proofSubmittedEmail(order),
    socketEvent: 'order:proofSubmitted',
  });

  return order;
}

// --- Admin-facing lifecycle transitions (routes/UI land in the admin panel phase;
// these service functions are the reusable business logic they'll call). ---

async function markUnderReview(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'proof_submitted') {
    throw new ApiError(400, `Cannot start review for an order in "${order.status}" status`);
  }
  order.status = 'under_review';
  await order.save();
  emitToAdmins('order:statusChanged', { orderId: String(order._id), status: order.status });
  emitToUser(order.user, 'order:statusChanged', { orderId: String(order._id), status: order.status });
  return order;
}

async function approveOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['proof_submitted', 'under_review'].includes(order.status)) {
    throw new ApiError(400, `Cannot approve an order in "${order.status}" status`);
  }
  order.status = 'approved';
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — payment approved',
    html: orderApprovedEmail(order),
    socketEvent: 'order:statusChanged',
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
  });

  return order;
}

async function getCredentialDownloadUrl(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
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

async function cancelOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!order.cancelRequested) throw new ApiError(400, 'This order has no pending cancellation request');
  order.status = 'cancelled';
  await order.save();
  emitToAdmins('order:statusChanged', { orderId: String(order._id), status: order.status });
  emitToUser(order.user, 'order:statusChanged', { orderId: String(order._id), status: order.status });
  return order;
}

async function rejectCancelRequest(orderId, reason) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!order.cancelRequested) throw new ApiError(400, 'This order has no pending cancellation request');
  order.cancelRequested = false;
  order.cancelRejectionReason = reason;
  await order.save();

  await notifyOrder(order, {
    subject: 'Accvendor — cancellation request declined',
    html: cancelRequestRejectedEmail(order),
    socketEvent: 'order:cancelRejected',
  });

  return order;
}

async function adminListOrders({ page, limit, status }) {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminListCancelRequests({ page, limit }) {
  const filter = { cancelRequested: true, status: 'delivered' };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'email').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function adminGetOrder(orderId) {
  const order = await Order.findById(orderId).populate('user', 'email').lean();
  if (!order) throw new ApiError(404, 'Order not found');
  return order;
}

// --- Cron-driven lifecycle (subscription expiry) ---

async function markExpiredOrders() {
  const now = new Date();
  const toExpire = await Order.find({ status: 'delivered', expiresAt: { $lte: now } });
  for (const order of toExpire) {
    order.status = 'expired';
    await order.save();
    await notifyOrder(order, {
      subject: 'Accvendor — subscription expired',
      html: orderExpiredEmail(order),
      socketEvent: 'order:statusChanged',
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

async function requestCancellation(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'delivered') {
    throw new ApiError(400, 'Only active (delivered) subscriptions can be cancelled');
  }
  if (order.cancelRequested) {
    throw new ApiError(400, 'A cancellation request is already pending for this order');
  }
  order.cancelRequested = true;
  order.cancelRejectionReason = null;
  await order.save();
  emitToAdmins('order:cancelRequested', { orderId: String(order._id), userId: String(userId) });
  return order;
}

async function getMyOrders(userId, { page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments({ user: userId }),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function getOrderById(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw new ApiError(404, 'Order not found');
  return order;
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
  getCredentialDownloadUrl,
  resolveCredentialDownload,
  markExpiredOrders,
  sendExpiryReminders,
  requestCancellation,
  cancelOrder,
  rejectCancelRequest,
  adminListOrders,
  adminListCancelRequests,
  adminGetOrder,
};
