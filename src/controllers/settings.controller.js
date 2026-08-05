const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const settingsService = require('../services/settings.service');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  apiResponse(res, 200, 'Settings fetched', { settings });
});

module.exports = { getSettings };
