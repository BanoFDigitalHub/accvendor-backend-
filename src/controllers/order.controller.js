const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const orderService = require('../services/order.service');
const { verifyCredentialToken } = require('../utils/token.util');

const create = asyncHandler(async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new ApiError(400, 'Idempotency-Key header is required');
  }

  const order = await orderService.createOrder(req.user._id, {
    ...req.body,
    idempotencyKey,
  });
  apiResponse(res, 201, 'Order created', { order });
});

const submitProof = asyncHandler(async (req, res) => {
  const order = await orderService.submitProof(req.user._id, req.params.id, req.body.proofUrl, req.body.transactionId);
  apiResponse(res, 200, 'Payment proof submitted', { order });
});

// Only ever reachable while the order is still awaiting payment — the service enforces that,
// not this handler.
const changePaymentMethod = asyncHandler(async (req, res) => {
  const order = await orderService.changePaymentMethod(req.user._id, req.params.id, req.body.paymentMethodId);
  apiResponse(res, 200, 'Payment method updated', { order });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, status, search } = req.query;
  const result = await orderService.getMyOrders(req.user._id, { page, limit, status, search });
  apiResponse(res, 200, 'Orders fetched', {
    orders: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const detail = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.user._id, req.params.id);
  apiResponse(res, 200, 'Order fetched', { order });
});

const getCredentialLink = asyncHandler(async (req, res) => {
  const downloadUrl = await orderService.getCredentialDownloadUrl(req.user._id, req.params.id);
  apiResponse(res, 200, 'Download link generated', { downloadUrl });
});

const requestCancel = asyncHandler(async (req, res) => {
  const order = await orderService.requestCancellation(req.user._id, req.params.id, req.body?.reason);
  apiResponse(res, 200, 'Cancellation requested', { order });
});

const downloadCredential = asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = verifyCredentialToken(req.query.token);
  } catch {
    throw new ApiError(401, 'This download link is invalid or has expired');
  }
  if (payload.orderId !== req.params.id) {
    throw new ApiError(403, 'This download link does not match the requested order');
  }
  const credentialFileUrl = await orderService.resolveCredentialDownload(payload.orderId, payload.userId);
  res.redirect(credentialFileUrl);
});

module.exports = { create, submitProof, changePaymentMethod, list, detail, downloadCredential, getCredentialLink, requestCancel };
