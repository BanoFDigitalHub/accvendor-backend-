const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const dashboardService = require('../../services/admin/dashboard.service');

const stats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getStats();
  apiResponse(res, 200, 'Dashboard stats fetched', data);
});

const revenue = asyncHandler(async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
  const series = await dashboardService.getRevenueSeries(days);
  apiResponse(res, 200, 'Revenue series fetched', { series });
});

module.exports = { stats, revenue };
