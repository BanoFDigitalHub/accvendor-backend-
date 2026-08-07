const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const orderService = require('../../services/order.service');

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
  const order = await orderService.cancelOrder(req.params.id);
  apiResponse(res, 200, 'Order cancelled', { order });
});

const rejectCancel = asyncHandler(async (req, res) => {
  const order = await orderService.rejectCancelRequest(req.params.id, req.body.reason);
  apiResponse(res, 200, 'Cancellation request rejected', { order });
});

module.exports = { list, detail, markUnderReview, approve, reject, deliver, cancelRequests, confirmCancel, rejectCancel };
