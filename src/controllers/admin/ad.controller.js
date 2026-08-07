const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const adService = require('../../services/admin/ad.service');

const list = asyncHandler(async (req, res) => {
  const result = await adService.listAds(req.query);
  apiResponse(res, 200, 'Ads fetched', {
    ads: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const create = asyncHandler(async (req, res) => {
  const ad = await adService.createAd(req.body);
  apiResponse(res, 201, 'Ad created', { ad });
});

const update = asyncHandler(async (req, res) => {
  const ad = await adService.updateAd(req.params.id, req.body);
  apiResponse(res, 200, 'Ad updated', { ad });
});

const remove = asyncHandler(async (req, res) => {
  await adService.deleteAd(req.params.id);
  apiResponse(res, 200, 'Ad deleted', null);
});

module.exports = { list, create, update, remove };
