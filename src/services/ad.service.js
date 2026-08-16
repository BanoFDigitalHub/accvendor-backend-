const { Ad, AD_PLACEMENTS } = require('../models/Ad');
const ApiError = require('../utils/ApiError');
const { optimizedUrl } = require('./upload.service');

/**
 * Trims an ad down to what a public visitor is allowed to see.
 *
 * Performance counters, internal name, scheduling window and device targeting all stay
 * server-side — the storefront only receives the creative it is about to render.
 */
function toPublicAd(ad) {
  return {
    id: String(ad._id),
    type: ad.type,
    placement: ad.placement,
    title: ad.title,
    description: ad.description,
    ctaLabel: ad.ctaLabel,
    imageUrl: optimizedUrl(ad.imageUrl, { width: 1200 }),
    // The untransformed original, shipped alongside so the slot has somewhere to fall back to.
    // `imageUrl` above is a *derived* Cloudinary asset (f_auto,q_auto,c_limit,w_1200), and a
    // derived asset is not permanent: Cloudinary regenerates it on demand and prunes it to
    // reclaim storage, and an account with "strict transformations" enabled refuses to
    // regenerate an unsigned one at all. Both failure modes look identical from here — the ad
    // renders for a day off the CDN edge and then the image is simply gone, while the original
    // upload is still sitting in the media library untouched. Only sent when it differs, so an
    // ad whose creative is a pasted third-party URL adds nothing to the payload.
    imageFallbackUrl:
      ad.imageUrl && optimizedUrl(ad.imageUrl, { width: 1200 }) !== ad.imageUrl ? ad.imageUrl : undefined,
    linkUrl: ad.linkUrl,
    code: ad.code,
    popup: ad.type === 'popup' ? ad.popup : undefined,
  };
}

/**
 * Serving filter: active, inside its scheduling window, and targeted at this device and page.
 *
 * A null startsAt/endsAt means "no bound on that side", so an ad with neither is always live
 * once activated. Page targeting is likewise permissive by omission: `all`, an empty list and a
 * missing field all mean every page, which is what every row predating the field has.
 */
function servingFilter({ placement, device, page, now = new Date() }) {
  const filter = {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  if (placement) filter.placement = String(placement).toLowerCase();
  if (device) filter.devices = device;
  if (page) {
    filter.$and.push({
      $or: [{ pages: 'all' }, { pages: page }, { pages: { $size: 0 } }, { pages: { $exists: false } }],
    });
  }
  return filter;
}

async function listActiveAds({ placement, device, page } = {}) {
  const ads = await Ad.find(servingFilter({ placement, device, page }))
    .sort({ priority: -1, sortOrder: 1, createdAt: -1 })
    .limit(20)
    .lean();
  return ads.map(toPublicAd);
}

/**
 * Every placement in one request, keyed by slot.
 *
 * The storefront renders several placements per page (top, sidebar, between-products, popup…);
 * fetching them together keeps a page view to a single ad request instead of one per slot.
 */
async function listAdsByPlacement({ device, page } = {}) {
  const ads = await Ad.find(servingFilter({ device, page }))
    .sort({ priority: -1, sortOrder: 1, createdAt: -1 })
    .limit(60)
    .lean();

  const grouped = Object.fromEntries(AD_PLACEMENTS.map((p) => [p, []]));
  for (const ad of ads) {
    if (!grouped[ad.placement]) grouped[ad.placement] = [];
    grouped[ad.placement].push(toPublicAd(ad));
  }
  return grouped;
}

/**
 * Impression tracking.
 *
 * Fire-and-forget and never validated against a session — an impression count is a rough
 * signal, not an audited figure, and it must never slow down or fail a page render. Accepts a
 * batch so one page view with several slots reports once.
 */
async function registerImpressions(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const result = await Ad.updateMany({ _id: { $in: ids.slice(0, 20) } }, { $inc: { impressions: 1 } });
  return result.modifiedCount;
}

async function registerClick(id) {
  // clickCount is the legacy counter kept in step so historical totals stay meaningful.
  const ad = await Ad.findByIdAndUpdate(
    id,
    { $inc: { clicks: 1, clickCount: 1 } },
    { returnDocument: 'after' }
  ).lean();
  if (!ad) throw new ApiError(404, 'Ad not found');
  return ad;
}

module.exports = { listActiveAds, listAdsByPlacement, registerImpressions, registerClick, toPublicAd };
