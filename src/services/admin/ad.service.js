const { Ad } = require('../../models/Ad');
const ApiError = require('../../utils/ApiError');

async function listAds({ page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Ad.find({}).sort({ placement: 1, sortOrder: 1 }).skip(skip).limit(limit).lean(),
    Ad.countDocuments({}),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function createAd(data) {
  return Ad.create(data);
}

async function updateAd(id, data) {
  const ad = await Ad.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
  if (!ad) throw new ApiError(404, 'Ad not found');
  return ad;
}

async function deleteAd(id) {
  const ad = await Ad.findByIdAndDelete(id);
  if (!ad) throw new ApiError(404, 'Ad not found');
  return ad;
}

module.exports = { listAds, createAd, updateAd, deleteAd };
