const AuditLog = require('../../models/AuditLog');

async function listAuditLog({ page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AuditLog.find({}).populate('admin', 'email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments({}),
  ]);
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { listAuditLog };
