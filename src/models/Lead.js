const mongoose = require('mongoose');

// Every "coming soon" programme collects the same three things and lands in the same place, so
// they share one collection with a discriminator rather than a table each. Adding a programme
// is one entry here plus a page — no new model, no new admin screen.
const LEAD_PROGRAMS = ['seller', 'affiliate'];

/**
 * Someone who asked to be told when a programme opens.
 *
 * Stored as well as emailed: the notification email is best-effort by design (a broken mailbox
 * must never fail the visitor's submission), so the row is what guarantees the lead survives.
 * The admin can read and export the list back even if no email ever arrived.
 */
const leadSchema = new mongoose.Schema(
  {
    program: { type: String, enum: LEAD_PROGRAMS, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    // Free text, not a parsed number: leads arrive with country codes, spaces and dashes, and
    // normalising them would only lose what the person actually typed.
    phone: { type: String, trim: true, default: '', maxlength: 40 },
    details: { type: String, trim: true, default: '', maxlength: 2000 },
    // Where they already sell, if anywhere. Optional and free text rather than a validated URL:
    // sellers answer this with a shop link, a marketplace profile, an Instagram handle or
    // "nowhere yet", and rejecting three of those to enforce a scheme would lose the lead.
    platformUrl: { type: String, trim: true, default: '', maxlength: 300 },

    // Incremented when the same address asks again — one row per address per programme, with a
    // count, rather than a pile of duplicates from someone who pressed the button twice.
    submissions: { type: Number, default: 1 },
    ip: { type: String, default: null },

    // Set by the admin once they have been contacted, so a long list stays workable.
    contactedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

// One row per address *per programme* — the same person may want both.
leadSchema.index({ program: 1, email: 1 }, { unique: true });
leadSchema.index({ program: 1, createdAt: -1 });

module.exports = { Lead: mongoose.model('Lead', leadSchema), LEAD_PROGRAMS };
