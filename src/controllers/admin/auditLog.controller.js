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

const remove = asyncHandler(async (req, res) => {
  const deletedCount = await auditLogService.deleteAuditLogs(req.body.ids);
  apiResponse(res, 200, 'Audit log entries deleted', { deletedCount });
});

const removeAll = asyncHandler(async (req, res) => {
  const deletedCount = await auditLogService.deleteAllAuditLogs();
  apiResponse(res, 200, 'Audit log cleared', { deletedCount });
});

module.exports = { list, remove, removeAll };
