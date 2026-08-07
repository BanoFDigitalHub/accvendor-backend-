const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const PaymentMethod = require('../models/PaymentMethod');

const list = asyncHandler(async (req, res) => {
  const paymentMethods = await PaymentMethod.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  apiResponse(res, 200, 'Payment methods fetched', { paymentMethods });
});

module.exports = { list };
