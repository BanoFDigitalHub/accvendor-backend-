const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const adService = require('../services/ad.service');

const list = asyncHandler(async (req, res) => {
  const ads = await adService.listActiveAds(req.query.placement);
  apiResponse(res, 200, 'Ads fetched', { ads });
});

const click = asyncHandler(async (req, res) => {
  const ad = await adService.registerClick(req.params.id);
  apiResponse(res, 200, 'Click registered', { linkUrl: ad.linkUrl });
});

module.exports = { list, click };
