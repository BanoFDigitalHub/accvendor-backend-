const { Ad } = require('../../models/Ad');
const ApiError = require('../../utils/ApiError');
const { destroyAsset } = require('../upload.service');

/** Derived status, so the admin table can say *why* an ad isn't showing. */
function withStatus(ad) {
  const now = new Date();
  let status = 'live';
  if (!ad.isActive) status = 'paused';
  else if (ad.startsAt && ad.startsAt > now) status = 'scheduled';
  else if (ad.endsAt && ad.endsAt < now) status = 'ended';

  return {
    ...ad,
    status,
    ctr: ad.impressions ? Math.round((ad.clicks / ad.impressions) * 1000) / 10 : 0,
  };
}

async function listAds({ page, limit, placement, isActive }) {
  const filter = {};
  if (placement) filter.placement = placement;
  if (isActive !== undefined) filter.isActive = isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Ad.find(filter).sort({ placement: 1, priority: -1, sortOrder: 1 }).skip(skip).limit(limit).lean(),
    Ad.countDocuments(filter),
  ]);
  return { items: items.map(withStatus), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function getAd(id) {
  const ad = await Ad.findById(id).lean();
  if (!ad) throw new ApiError(404, 'Ad not found');
  return withStatus(ad);
}

async function createAd(data) {
  const ad = await Ad.create(data);
  return withStatus(ad.toObject());
}

async function updateAd(id, data) {
  const ad = await Ad.findById(id);
  if (!ad) throw new ApiError(404, 'Ad not found');

  // Swapping the banner destroys the image it replaces, but only when we own it (an uploaded
  // asset has a publicId; a pasted URL does not).
  const replacingImage = data.imageUrl !== undefined && data.imageUrl !== ad.imageUrl && ad.imagePublicId;
  const oldPublicId = replacingImage ? ad.imagePublicId : null;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    // Nested popup config is merged rather than replaced, so a partial update that touches
    // only `delaySeconds` doesn't reset frequency and cooldown to their defaults.
    if (key === 'popup') ad.popup = { ...(ad.popup?.toObject?.() || ad.popup || {}), ...value };
    else ad[key] = value;
  }
  await ad.save();

  if (oldPublicId) await destroyAsset(oldPublicId);
  return withStatus(ad.toObject());
}

/** Explicit enable/disable, so the admin table's toggle is one obvious call. */
async function setActive(id, isActive) {
  const ad = await Ad.findByIdAndUpdate(id, { $set: { isActive } }, { returnDocument: 'after' }).lean();
  if (!ad) throw new ApiError(404, 'Ad not found');
  return withStatus(ad);
}

async function deleteAd(id) {
  const ad = await Ad.findByIdAndDelete(id);
  if (!ad) throw new ApiError(404, 'Ad not found');
  if (ad.imagePublicId) await destroyAsset(ad.imagePublicId);
  return ad;
}

async function resetStats(id) {
  const ad = await Ad.findByIdAndUpdate(
    id,
    { $set: { impressions: 0, clicks: 0, clickCount: 0 } },
    { returnDocument: 'after' }
  ).lean();
  if (!ad) throw new ApiError(404, 'Ad not found');
  return withStatus(ad);
}

module.exports = { listAds, getAd, createAd, updateAd, setActive, deleteAd, resetStats };
