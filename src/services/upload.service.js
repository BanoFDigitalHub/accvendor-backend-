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

module.exports = {
  isConfigured,
  signPaymentProofUpload,
  signSupportAttachmentUpload,
  signProductImageUpload,
  signAdImageUpload,
  signPaymentQrUpload,
  signCredentialFileUpload,
  destroyAsset,
  optimizedUrl,
};
