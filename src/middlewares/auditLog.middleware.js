const AuditLog = require('../models/AuditLog');

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const REDACTED_FIELDS = new Set(['password', 'newPassword', 'securityAnswer', 'code', 'token', 'pendingToken', 'otp']);

function summarizeBody(body) {
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) return null;
  const redacted = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, REDACTED_FIELDS.has(key) ? '[redacted]' : value])
  );
  const json = JSON.stringify(redacted);
  return json.length > 2000 ? { truncated: true, preview: json.slice(0, 2000) } : redacted;
}

function auditLog(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    AuditLog.create({
      admin: req.user._id,
      action: `${req.method} ${req.originalUrl.split('?')[0]}`,
      targetId: req.params?.id || null,
      details: summarizeBody(req.body),
      ip: req.ip,
    }).catch((err) => console.error('[audit] failed to write log:', err.message));
  });

  next();
}

module.exports = auditLog;
