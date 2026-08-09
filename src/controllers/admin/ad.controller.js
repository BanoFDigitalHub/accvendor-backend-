const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const adService = require('../../services/admin/ad.service');
const { AD_PLACEMENTS, AD_TYPES, AD_DEVICES, AD_FREQUENCIES } = require('../../models/Ad');

const list = asyncHandler(async (req, res) => {
  const result = await adService.listAds(req.query);
  apiResponse(res, 200, 'Ads fetched', {
    ads: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const detail = asyncHandler(async (req, res) => {
  const ad = await adService.getAd(req.params.id);
  apiResponse(res, 200, 'Ad fetched', { ad });
});

const create = asyncHandler(async (req, res) => {
  const ad = await adService.createAd(req.body);
  apiResponse(res, 201, 'Ad created', { ad });
});

const update = asyncHandler(async (req, res) => {
  const ad = await adService.updateAd(req.params.id, req.body);
  apiResponse(res, 200, 'Ad updated', { ad });
});

const setActive = asyncHandler(async (req, res) => {
  const ad = await adService.setActive(req.params.id, req.body.isActive);
  apiResponse(res, 200, ad.isActive ? 'Ad enabled' : 'Ad disabled', { ad });
});

const resetStats = asyncHandler(async (req, res) => {
  const ad = await adService.resetStats(req.params.id);
  apiResponse(res, 200, 'Ad statistics reset', { ad });
});

const remove = asyncHandler(async (req, res) => {
  await adService.deleteAd(req.params.id);
  apiResponse(res, 200, 'Ad deleted', null);
});

// The option lists the admin form renders, served rather than duplicated in the client so the
// two can't drift out of sync with what the validator will accept.
const options = asyncHandler(async (req, res) => {
  apiResponse(res, 200, 'Ad options fetched', {
    placements: AD_PLACEMENTS,
    types: AD_TYPES,
    devices: AD_DEVICES,
    frequencies: AD_FREQUENCIES,
  });
});

module.exports = { list, detail, create, update, setActive, resetStats, remove, options };
