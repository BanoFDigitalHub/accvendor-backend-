const AuditLog = require('../../models/AuditLog');

async function listAuditLog({ page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AuditLog.find({}).populate('admin', 'email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments({}),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function deleteAuditLogs(ids) {
  const result = await AuditLog.deleteMany({ _id: { $in: ids } });
  return result.deletedCount;
}

async function deleteAllAuditLogs() {
  const result = await AuditLog.deleteMany({});
  return result.deletedCount;
}

module.exports = { listAuditLog, deleteAuditLogs, deleteAllAuditLogs };
