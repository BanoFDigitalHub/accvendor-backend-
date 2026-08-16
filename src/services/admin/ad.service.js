const { Ad } = require('../../models/Ad');
const ApiError = require('../../utils/ApiError');
const { destroyAsset } = require('../upload.service');
const { env } = require('../../config/env');

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

/**
 * Whether `url` is a delivery URL for `publicId` — the same Cloudinary asset, whatever
 * transformation segment happens to sit in the path.
 *
 * A Cloudinary URL is `.../upload/<transformations>/<publicId>.<ext>`, so the same asset has
 * infinitely many valid URLs and comparing the strings answers the wrong question.
 */
function urlPointsAt(url, publicId) {
  if (!url || !publicId) return false;
  return String(url).includes(publicId);
}

/**
 * Destroys a creative only once **no ad still points at it**.
 *
 * Two ads are allowed to share one creative — the admin sets the second one's image by pasting
 * the first one's URL, or by duplicating the ad — and nothing about that is unusual. But
 * `destroyAsset` is account-wide: deleting or re-imaging one of those ads used to destroy the
 * shared asset out from under the other, which was still live and still pointing at it.
 *
 * That is not hypothetical, it is what happened here. Two ads were pointed at the same upload,
 * one of them was deleted five seconds later, and the surviving ad's creative was gone. It went
 * unnoticed for a day because Cloudinary keeps serving a destroyed asset from its CDN edge for a
 * while — the ad rendered perfectly all afternoon and was blank the next morning, so the blame
 * never landed on the delete.
 *
 * The reference check covers both ways an ad can claim an asset: as its recorded `imagePublicId`
 * and inside its `imageUrl` (a pasted URL is stored with no publicId at all, so it would
 * otherwise count as no reference). `excludeId` is the ad we are currently updating or deleting,
 * whose own claim must not keep the asset alive.
 */
async function releaseCreative(publicId, excludeId) {
  if (!publicId) return;
  // The outer switch, and it is off by default — see `env.cloudinary.deleteUnusedAdCreatives`.
  // A few megabytes of unused upload is a cheaper problem than an ad creative that disappears.
  if (!env.cloudinary.deleteUnusedAdCreatives) return;
  // Escaped: a publicId is Cloudinary-generated and tame, but it is still interpolated into a
  // regex and a stray metacharacter must not silently widen the match.
  const escaped = publicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stillUsed = await Ad.exists({
    _id: { $ne: excludeId },
    $or: [{ imagePublicId: publicId }, { imageUrl: new RegExp(escaped) }],
  });
  if (stillUsed) return;
  await destroyAsset(publicId);
}

async function updateAd(id, data) {
  const ad = await Ad.findById(id);
  if (!ad) throw new ApiError(404, 'Ad not found');

  const previousPublicId = ad.imagePublicId;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    // Nested popup config is merged rather than replaced, so a partial update that touches
    // only `delaySeconds` doesn't reset frequency and cooldown to their defaults.
    if (key === 'popup') ad.popup = { ...(ad.popup?.toObject?.() || ad.popup || {}), ...value };
    else ad[key] = value;
  }

  // Ownership has to survive an edit that never touched the creative. The admin form nulls
  // `imagePublicId` the moment anything types into the URL box, and a partial update may carry
  // `imageUrl` with no id at all — either way the ad would come out still displaying our asset
  // while no longer claiming it, so nothing could ever clean it up. Re-attach the id we already
  // had whenever the URL still resolves to that same asset. Mirrors `normalizeMedia` on products.
  if (data.imagePublicId == null && urlPointsAt(ad.imageUrl, previousPublicId)) {
    ad.imagePublicId = previousPublicId;
  }

  await ad.save();

  // **Destroy only what is genuinely being replaced.** This used to fire on a bare string
  // inequality between the incoming `imageUrl` and the stored one, which meant any save that
  // sent the same asset under a different URL — a transformed variant, a protocol or CDN-host
  // difference, a re-encoded query — deleted the creative that was still on screen. Cloudinary
  // keeps serving a deleted asset from its CDN edge for a while, so the ad looked fine for the
  // rest of the day and then went blank, which is why it never got traced back to the edit.
  //
  // Now the asset is destroyed only when the saved ad no longer references it at all: not
  // through its URL, and not as its recorded publicId.
  const stillReferenced =
    urlPointsAt(ad.imageUrl, previousPublicId) || ad.imagePublicId === previousPublicId;
  if (previousPublicId && !stillReferenced) await releaseCreative(previousPublicId, ad._id);

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
  // The row is already gone, so it cannot count as a reference to its own creative — but any
  // *other* ad sharing that upload can, and deleting this one must not take their image with it.
  await releaseCreative(ad.imagePublicId, ad._id);
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
