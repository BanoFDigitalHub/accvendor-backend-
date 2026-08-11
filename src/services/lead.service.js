const { Lead, LEAD_PROGRAMS } = require('../models/Lead');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');
const { sendMail } = require('./email.service');
const { notifyAdmins } = require('./notification.service');
const { leadEmail, leadConfirmationEmail, adminMessageEmail } = require('../utils/emailTemplates');

const PROGRAM_LABELS = { seller: 'Seller', affiliate: 'Affiliate' };
const label = (program) => PROGRAM_LABELS[program] || program;

/** Every admin's address, so a lead reaches whoever is actually working. */
async function adminRecipients() {
  const admins = await User.find({ role: 'admin', isBlocked: { $ne: true } })
    .select('email')
    .lean();
  const list = admins.map((a) => a.email).filter(Boolean);
  // env.emailFrom is a verified sender, so it is always a deliverable address of ours — the
  // right last resort when no admin row has an email for some reason.
  return list.length ? list : [env.emailFrom].filter(Boolean);
}

/**
 * Records interest in a programme and tells the admins about it.
 *
 * The same address asking twice updates its row rather than creating a second one; the admin
 * sees the newer details either way, since a second submission usually means "I forgot to
 * mention something".
 */
async function registerInterest({ program, name, email, phone = '', details = '', ip = null }) {
  const lead = await Lead.findOneAndUpdate(
    { program, email: String(email).toLowerCase().trim() },
    { $set: { name, phone, details, ip }, $inc: { submissions: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  const isRepeat = lead.submissions > 1;

  await notifyAdmins({
    event: 'lead:created',
    category: 'account',
    title: `${label(program)} waitlist — ${isRepeat ? 'updated entry' : 'new signup'}`,
    body: `${name} <${lead.email}>${phone ? ` · ${phone}` : ''}`,
    link: `/admin/leads?program=${program}`,
    meta: { leadId: String(lead._id), program, email: lead.email },
  });

  // Both sends are best-effort: a mail failure must never turn a successful submission into an
  // error for the visitor, who has done nothing wrong and cannot fix it. The row is the record.
  const to = await adminRecipients();
  if (to.length) {
    await sendMail({
      to: to.join(','),
      subject: `${isRepeat ? 'Updated' : 'New'} ${label(program).toLowerCase()} waitlist signup — ${name}`,
      html: leadEmail({ program: label(program), name, email: lead.email, phone, details, isRepeat, submissions: lead.submissions }),
    });
  }

  await sendMail({
    to: lead.email,
    subject: `You're on the Accvendor ${label(program).toLowerCase()} waitlist`,
    html: leadConfirmationEmail({ program: label(program), name }),
  });

  return { email: lead.email, alreadyOnList: isRepeat };
}

async function listLeads({ program, page = 1, limit = 20, search = '' }) {
  const filter = {};
  if (program) filter.program = program;
  if (search) {
    // Escaped: a search box is user input, and an unescaped regex is both a crash and a way to
    // hand the database a catastrophically slow pattern.
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const skip = (page - 1) * limit;
  const [items, total, counts] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Lead.countDocuments(filter),
    Lead.aggregate([{ $group: { _id: '$program', n: { $sum: 1 } } }]),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    // Per-programme totals, so the tabs can carry a count without a second request.
    counts: Object.fromEntries(LEAD_PROGRAMS.map((p) => [p, counts.find((c) => c._id === p)?.n || 0])),
  };
}

const CSV_COLUMNS = [
  ['Name', (l) => l.name],
  ['Email', (l) => l.email],
  ['Phone', (l) => l.phone || ''],
  ['Programme', (l) => l.program],
  ['Details', (l) => l.details || ''],
  ['Submissions', (l) => l.submissions],
  ['Contacted', (l) => (l.contactedAt ? new Date(l.contactedAt).toISOString().slice(0, 10) : '')],
  ['Notes', (l) => l.notes || ''],
  ['Signed up', (l) => new Date(l.createdAt).toISOString().slice(0, 16).replace('T', ' ')],
];

/**
 * Quotes one CSV field.
 *
 * The leading apostrophe on =, +, - and @ is deliberate: Excel and Sheets treat a cell starting
 * with those as a *formula*, so a "name" of `=cmd|...` becomes a live command when the export is
 * opened. Prefixing forces it back to text.
 */
function csvCell(value) {
  const s = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The whole list as CSV — Excel opens it directly. */
async function exportLeadsCsv({ program }) {
  const filter = program ? { program } : {};
  const leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();

  const rows = [
    CSV_COLUMNS.map(([header]) => csvCell(header)).join(','),
    ...leads.map((l) => CSV_COLUMNS.map(([, read]) => csvCell(read(l))).join(',')),
  ];

  // The BOM is what makes Excel read the file as UTF-8; without it, any non-ASCII name opens as
  // mojibake on Windows.
  return { csv: `﻿${rows.join('\r\n')}\r\n`, count: leads.length };
}

/**
 * Emails one lead, by row id.
 *
 * The address comes from the stored row, never from the request, so this cannot be used to mail
 * an arbitrary third party — the admin picks a lead, not an address.
 */
async function emailLead(id, { subject, message }, admin) {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, 'Lead not found');

  const sent = await sendMail({
    to: lead.email,
    subject,
    html: adminMessageEmail({ subject, message, recipientName: lead.name }),
  });

  lead.contactedAt = new Date();
  await lead.save();

  return { to: lead.email, delivered: sent !== false, by: admin?.email || null };
}

async function updateLead(id, data) {
  const lead = await Lead.findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after' }).lean();
  if (!lead) throw new ApiError(404, 'Lead not found');
  return lead;
}

async function deleteLead(id) {
  const lead = await Lead.findByIdAndDelete(id);
  if (!lead) throw new ApiError(404, 'Lead not found');
  return true;
}

module.exports = { registerInterest, listLeads, exportLeadsCsv, emailLead, updateLead, deleteLead };
