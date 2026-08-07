const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const uploadService = require('../services/upload.service');

const signPaymentProof = asyncHandler(async (req, res) => {
  if (!uploadService.isConfigured) {
    throw new ApiError(
      501,
      'File uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env to enable payment proof uploads.'
    );
  }
  const data = uploadService.signPaymentProofUpload(req.user._id);
  apiResponse(res, 200, 'Upload signature generated', data);
});

const signSupportAttachment = asyncHandler(async (req, res) => {
  if (!uploadService.isConfigured) {
    throw new ApiError(
      501,
      'File uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env to enable attachment uploads.'
    );
  }
  const data = uploadService.signSupportAttachmentUpload(req.user._id);
  apiResponse(res, 200, 'Upload signature generated', data);
});

const signProductImage = asyncHandler(async (req, res) => {
  if (!uploadService.isConfigured) {
    throw new ApiError(
      501,
      'File uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env to enable product image uploads.'
    );
  }
  const data = uploadService.signProductImageUpload(req.user._id);
  apiResponse(res, 200, 'Upload signature generated', data);
});

const signCredentialFile = asyncHandler(async (req, res) => {
  if (!uploadService.isConfigured) {
    throw new ApiError(
      501,
      'File uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server/.env to enable credential file uploads.'
    );
  }
  const data = uploadService.signCredentialFileUpload(req.user._id);
  apiResponse(res, 200, 'Upload signature generated', data);
});

module.exports = { signPaymentProof, signSupportAttachment, signProductImage, signCredentialFile };
