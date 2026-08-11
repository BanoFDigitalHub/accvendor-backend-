const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const service = require('../../services/lead.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listLeads(req.query);
  apiResponse(res, 200, 'Leads fetched', {
    leads: result.items,
    counts: result.counts,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

/**
 * The list as a CSV download.
 *
 * Answers with a file rather than the usual JSON envelope on purpose — the browser is meant to
 * save this, and Excel opens it directly.
 */
const exportCsv = asyncHandler(async (req, res) => {
  const { csv, count } = await service.exportLeadsCsv(req.query);
  const name = `accvendor-${req.query.program || 'all'}-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('X-Row-Count', String(count));
  res.send(csv);
});

const email = asyncHandler(async (req, res) => {
  const result = await service.emailLead(req.params.id, req.body, req.user);
  apiResponse(res, 200, 'Email sent', result);
});

const update = asyncHandler(async (req, res) => {
  const lead = await service.updateLead(req.params.id, req.body);
  apiResponse(res, 200, 'Lead updated', { lead });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteLead(req.params.id);
  apiResponse(res, 200, 'Lead deleted', null);
});

module.exports = { list, exportCsv, email, update, remove };
