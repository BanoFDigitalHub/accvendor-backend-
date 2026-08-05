const { Ad } = require('../models/Ad');
const ApiError = require('../utils/ApiError');

async function listActiveAds(placement) {
  const filter = { isActive: true };
  if (placement) filter.placement = placement.toLowerCase();
  return Ad.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

async function registerClick(id) {
  const ad = await Ad.findByIdAndUpdate(id, { $inc: { clickCount: 1 } }, { returnDocument: 'after' }).lean();
  if (!ad) throw new ApiError(404, 'Ad not found');
  return ad;
}

module.exports = { listActiveAds, registerClick };
