const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const adService = require('../services/ad.service');

const list = asyncHandler(async (req, res) => {
  const { placement, device, page } = req.query;
  const ads = await adService.listActiveAds({ placement, device, page });
  apiResponse(res, 200, 'Ads fetched', { ads });
});

// Every placement in one response, so a page view costs one ad request rather than one per slot.
const byPlacement = asyncHandler(async (req, res) => {
  const placements = await adService.listAdsByPlacement({ device: req.query.device, page: req.query.page });
  apiResponse(res, 200, 'Ads fetched', { placements });
});

const impressions = asyncHandler(async (req, res) => {
  const counted = await adService.registerImpressions(req.body.ids);
  apiResponse(res, 200, 'Impressions recorded', { counted });
});

const click = asyncHandler(async (req, res) => {
  const ad = await adService.registerClick(req.params.id);
  apiResponse(res, 200, 'Click registered', { linkUrl: ad.linkUrl });
});

module.exports = { list, byPlacement, impressions, click };
