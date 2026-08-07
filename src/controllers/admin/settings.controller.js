const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const settingsService = require('../../services/settings.service');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  apiResponse(res, 200, 'Settings fetched', { settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);
  apiResponse(res, 200, 'Settings updated', { settings });
});

module.exports = { getSettings, updateSettings };
