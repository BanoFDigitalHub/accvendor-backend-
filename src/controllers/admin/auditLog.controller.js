const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const auditLogService = require('../../services/admin/auditLog.service');

const list = asyncHandler(async (req, res) => {
  const result = await auditLogService.listAuditLog(req.query);
  apiResponse(res, 200, 'Audit log fetched', {
    logs: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

module.exports = { list };
