const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const orderService = require('../../services/order.service');
const adminEmailService = require('../../services/admin/email.service');

const list = asyncHandler(async (req, res) => {
  const result = await orderService.adminListOrders(req.query);
  apiResponse(res, 200, 'Orders fetched', {
    orders: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const detail = asyncHandler(async (req, res) => {
  const order = await orderService.adminGetOrder(req.params.id);
  apiResponse(res, 200, 'Order fetched', { order });
});

const markUnderReview = asyncHandler(async (req, res) => {
  const order = await orderService.markUnderReview(req.params.id);
  apiResponse(res, 200, 'Order marked under review', { order });
});

const approve = asyncHandler(async (req, res) => {
  const order = await orderService.approveOrder(req.params.id);
  apiResponse(res, 200, 'Order approved', { order });
});

const reject = asyncHandler(async (req, res) => {
  const order = await orderService.rejectOrder(req.params.id, req.body.reason);
  apiResponse(res, 200, 'Order rejected', { order });
});

const deliver = asyncHandler(async (req, res) => {
  const order = await orderService.deliverOrder(req.params.id, req.body);
  apiResponse(res, 200, 'Order delivered', { order });
});

const cancelRequests = asyncHandler(async (req, res) => {
  const result = await orderService.adminListCancelRequests(req.query);
  apiResponse(res, 200, 'Cancellation requests fetched', {
    orders: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const confirmCancel = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id, req.user._id);
  apiResponse(res, 200, 'Order cancelled', { order });
});

const rejectCancel = asyncHandler(async (req, res) => {
  const order = await orderService.rejectCancelRequest(req.params.id, req.body.reason, req.user._id);
  apiResponse(res, 200, 'Cancellation request rejected', { order });
});

// Manual nudge for an order still sitting in pending_payment.
const paymentReminder = asyncHandler(async (req, res) => {
  const order = await orderService.sendPaymentReminder(req.params.id);
  apiResponse(res, 200, 'Payment reminder sent', { order });
});

// Free-form admin -> customer email, always addressed to the account's registered address
// (taken from the order, never from the request body).
const emailCustomer = asyncHandler(async (req, res) => {
  const result = await adminEmailService.emailOrderCustomer(req.params.id, req.body, req.user);
  apiResponse(res, 200, 'Email sent', result);
});

module.exports = {
  list,
  detail,
  markUnderReview,
  approve,
  reject,
  deliver,
  cancelRequests,
  confirmCancel,
  rejectCancel,
  paymentReminder,
  emailCustomer,
};
