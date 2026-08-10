const cloudinary = require('cloudinary').v2;
const { env } = require('../config/env');

const isConfigured = Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

if (isConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
} else {
  console.warn(
    '[upload] Cloudinary is not configured — upload signing is disabled.\n' +
      '[upload] Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in server/.env to enable it.'
  );
}

function signUpload(userId, folderPrefix) {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `accvendor/${folderPrefix}/${userId}`;
  const paramsToSign = { timestamp, folder };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.cloudinary.apiSecret);

  return {
    signature,
    timestamp,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/auto/upload`,
  };
}

function signPaymentProofUpload(userId) {
  return signUpload(userId, 'payment-proofs');
}

function signSupportAttachmentUpload(userId) {
  return signUpload(userId, 'support-attachments');
}

function signProductImageUpload(adminId) {
  return signUpload(adminId, 'product-images');
}

function signAdImageUpload(adminId) {
  return signUpload(adminId, 'ad-images');
}

function signPaymentQrUpload(adminId) {
  return signUpload(adminId, 'payment-qr');
}

function signCredentialFileUpload(adminId) {
  // The buyer never sees this Cloudinary URL directly — deliverOrder() stores
  // it server-side and only ever hands out the short-lived, server-signed
  // download token from token.util.js's signCredentialToken (see order.routes.js's
  // GET /:id/credential), which is what actually satisfies "signed, private,
  // time-limited URLs — never public Cloudinary URLs" from the credential-delivery spec.
  return signUpload(adminId, 'credential-files');
}

/**
 * Imports an image the admin supplied as a URL into Cloudinary, so it becomes an asset we own.
 *
 * Cloudinary does the fetching — the URL is handed to its API and never requested by this
 * server, so this cannot be turned into an SSRF probe of our own network. Admin-only.
 *
 * Importing rather than merely storing the link is what makes "add by URL" hold up: a linked
 * third-party image can start 403ing on hotlink protection, move, or vanish, and we would have
 * no publicId to clean up either. Callers fall back to storing the plain URL when this fails,
 * so an un-fetchable source still degrades to the old behaviour instead of blocking the edit.
 */
async function importFromUrl(url, folderPrefix, userId) {
  if (!isConfigured) throw new Error('Cloudinary is not configured');
  const result = await cloudinary.uploader.upload(url, {
    folder: `accvendor/${folderPrefix}/${userId}`,
    resource_type: 'image',
  });
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Deletes an asset we own. Only ever called with a publicId the server itself recorded when
 * the asset was attached (product media, ad banner, payment QR) — a caller-supplied id is
 * never trusted, so an admin can't be tricked into destroying an unrelated asset.
 *
 * Failures are swallowed: a leaked Cloudinary object is not a reason to fail the database
 * write the caller is actually performing.
 */
async function destroyAsset(publicId) {
  if (!isConfigured || !publicId) return false;
  try {
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return result?.result === 'ok';
  } catch (err) {
    console.warn(`[upload] failed to destroy ${publicId}:`, err.message);
    return false;
  }
}

/**
 * Cloudinary delivery transform for storefront imagery: auto format/quality and a sane cap on
 * dimensions, applied at the URL level so the original stays untouched. Non-Cloudinary URLs
 * (pasted by the admin) pass through unchanged.
 */
function optimizedUrl(url, { width = 800 } = {}) {
  if (!url || !url.includes('/upload/')) return url;
  if (!/res\.cloudinary\.com/.test(url)) return url;
  if (/\/upload\/[^/]*[fq]_/.test(url)) return url; // already transformed
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${width}/`);
}

// Widths offered to the browser for a product image. A card in a four-up grid needs nowhere
// near the detail page's hero, and shipping one size for both wastes most of the bytes on the
// listing — which is the page a shopper hits first.
const IMAGE_WIDTHS = [320, 640, 960, 1280];

/**
 * A `srcset` string for a product image, so the browser downloads the size it will actually
 * paint. Returns null for anything we can't transform (a pasted third-party URL), in which case
 * the caller just uses the plain `src` and nothing breaks.
 */
function srcSetFor(url) {
  if (!url || !/res\.cloudinary\.com/.test(url) || !url.includes('/upload/')) return null;
  if (/\/upload\/[^/]*[fq]_/.test(url)) return null; // already transformed — leave it alone
  return IMAGE_WIDTHS.map((w) => `${optimizedUrl(url, { width: w })} ${w}w`).join(', ');
}

module.exports = {
  isConfigured,
  signPaymentProofUpload,
  signSupportAttachmentUpload,
  signProductImageUpload,
  signAdImageUpload,
  signPaymentQrUpload,
  signCredentialFileUpload,
  destroyAsset,
  importFromUrl,
  optimizedUrl,
  srcSetFor,
};
