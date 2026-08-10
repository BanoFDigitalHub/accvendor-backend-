const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const uploadService = require('../services/upload.service');

function assertConfigured(what) {
  if (uploadService.isConfigured) return;
  throw new ApiError(
    501,
    `File uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env to enable ${what}.`
  );
}

// --- Customer-scoped (requireAuth) ---

const signPaymentProof = asyncHandler(async (req, res) => {
  assertConfigured('payment proof uploads');
  apiResponse(res, 200, 'Upload signature generated', uploadService.signPaymentProofUpload(req.user._id));
});

const signSupportAttachment = asyncHandler(async (req, res) => {
  assertConfigured('attachment uploads');
  apiResponse(res, 200, 'Upload signature generated', uploadService.signSupportAttachmentUpload(req.user._id));
});

// --- Admin-scoped (requireAdminAuth, mounted under /api/admin/uploads) ---

const signProductImage = asyncHandler(async (req, res) => {
  assertConfigured('product image uploads');
  apiResponse(res, 200, 'Upload signature generated', uploadService.signProductImageUpload(req.user._id));
});

const signAdImage = asyncHandler(async (req, res) => {
  assertConfigured('advertisement image uploads');
  apiResponse(res, 200, 'Upload signature generated', uploadService.signAdImageUpload(req.user._id));
});

const signPaymentQr = asyncHandler(async (req, res) => {
  assertConfigured('payment QR uploads');
  apiResponse(res, 200, 'Upload signature generated', uploadService.signPaymentQrUpload(req.user._id));
});

const signCredentialFile = asyncHandler(async (req, res) => {
  assertConfigured('credential file uploads');
  apiResponse(res, 200, 'Upload signature generated', uploadService.signCredentialFileUpload(req.user._id));
});

/**
 * Pulls an admin-supplied image URL into Cloudinary so it becomes an asset we own and manage.
 *
 * Answers 422 rather than 500 when Cloudinary cannot fetch the source (hotlink protection, a
 * page URL instead of an image, a dead link). That is a fact about the URL the admin pasted,
 * not a server fault, and the client uses it to fall back to storing the plain link.
 */
const importImageFromUrl = asyncHandler(async (req, res) => {
  assertConfigured('importing images by URL');
  const { url, kind } = req.body;
  const folder = kind === 'payment-qr' ? 'payment-qr' : 'product-images';
  try {
    const asset = await uploadService.importFromUrl(url, folder, req.user._id);
    apiResponse(res, 200, 'Image imported', asset);
  } catch (err) {
    throw new ApiError(422, `Could not fetch that image URL: ${err.message}`);
  }
});

module.exports = {
  signPaymentProof,
  signSupportAttachment,
  signProductImage,
  signAdImage,
  signPaymentQr,
  signCredentialFile,
  importImageFromUrl,
};
