const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const service = require('../services/lead.service');

const registerInterest = asyncHandler(async (req, res) => {
  const result = await service.registerInterest({ ...req.body, ip: req.ip });
  apiResponse(res, 201, "You're on the list — we'll email you when it opens", result);
});

module.exports = { registerInterest };
