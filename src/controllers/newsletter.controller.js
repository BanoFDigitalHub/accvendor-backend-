const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const newsletterService = require('../services/newsletter.service');

const subscribe = asyncHandler(async (req, res) => {
  await newsletterService.subscribe(req.body.email);
  apiResponse(res, 201, "You're subscribed! Watch your inbox for deals and updates.");
});

module.exports = { subscribe };
