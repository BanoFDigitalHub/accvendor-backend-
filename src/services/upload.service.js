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
    '[upload] Cloudinary is not configured — payment proof upload signing is disabled.\n' +
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

function signCredentialFileUpload(adminId) {
  // The buyer never sees this Cloudinary URL directly — deliverOrder() stores
  // it server-side and only ever hands out the short-lived, server-signed
  // download token from token.util.js's signCredentialToken (see order.routes.js's
  // GET /:id/credential), which is what actually satisfies "signed, private,
  // time-limited URLs — never public Cloudinary URLs" from the credential-delivery spec.
  return signUpload(adminId, 'credential-files');
}

module.exports = {
  isConfigured,
  signPaymentProofUpload,
  signSupportAttachmentUpload,
  signProductImageUpload,
  signCredentialFileUpload,
};
