const mongoose = require('mongoose');

const AD_TYPES = ['banner', 'popup', 'adsterra', 'adsense'];

// Canonical placement slots the storefront renders. Kept as a plain string in the schema (not an
// enum) so pre-existing rows with ad-hoc placements keep loading; the zod validator constrains
// what the admin panel is allowed to write from here on.
const AD_PLACEMENTS = [
  'top',
  'header',
  'hero',
  'above-products',
  'between-products',
  'sidebar',
  'bottom',
  'left',
  'right',
  'footer',
  'popup',
];

const AD_DEVICES = ['desktop', 'tablet', 'mobile'];
const AD_FREQUENCIES = ['always', 'session', 'daily', 'once'];

// Which storefront pages an ad is allowed to appear on. A placement says *where on the page*;
// this says *which pages* — an admin who wants a banner only on the catalog needs both. The keys
// are groups rather than raw paths so a new route doesn't silently fall outside every rule:
// `client/src/site/lib/adPage.js` maps a pathname onto exactly one of them.
// 'all' is the default and short-circuits the rest.
const AD_PAGES = ['all', 'home', 'products', 'product', 'dashboard', 'tools', 'info'];

const popupSchema = new mongoose.Schema(
  {
    delaySeconds: { type: Number, default: 6, min: 0, max: 120 },
    // How long the popup stays on screen once shown, and the duration the countdown line across
    // its top drains over. Separate from `delaySeconds` on purpose: that one is how long the
    // visitor waits before seeing it, this one is how long they then have — overloading a single
    // field to mean both would make "6 seconds" ambiguous in the admin form.
    // Defaults to 0 — no countdown, the popup waits to be closed — so every ad that predates
    // this field keeps behaving exactly as it did.
    autoCloseSeconds: { type: Number, default: 0, min: 0, max: 120 },
    // How often a returning visitor may see this popup again. 'session' = once per tab session,
    // 'daily' = once per calendar day, 'once' = never again on that device.
    frequency: { type: String, enum: AD_FREQUENCIES, default: 'session' },
    cooldownHours: { type: Number, default: 24, min: 0, max: 24 * 90 },
    dismissible: { type: Boolean, default: true },
  },
  { _id: false }
);

const adSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // internal label, never rendered publicly
    type: { type: String, enum: AD_TYPES, required: true, default: 'banner' },
    placement: { type: String, required: true, trim: true, lowercase: true },

    // --- Creative -------------------------------------------------------------------
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    ctaLabel: { type: String, trim: true, default: '' },
    imageUrl: { type: String, default: null },
    imagePublicId: { type: String, default: null }, // set when the banner was uploaded to Cloudinary
    linkUrl: { type: String, default: null },
    // Raw Adsterra/AdSense embed, only used by the network ad types.
    code: { type: String, trim: true, default: '' },

    // --- Targeting & scheduling ------------------------------------------------------
    // Higher priority wins when several ads compete for the same placement.
    priority: { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    devices: { type: [String], enum: AD_DEVICES, default: AD_DEVICES },
    // Rows that predate page targeting have no value here, which `servingFilter` reads as
    // "everywhere" — exactly the behaviour they had before, so nothing needs backfilling.
    pages: { type: [String], default: ['all'] },
    isActive: { type: Boolean, default: true, index: true },

    popup: { type: popupSchema, default: () => ({}) },

    // --- Performance ------------------------------------------------------------------
    // Counters only; CTR is derived on read so it can never drift out of sync with them.
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    // Legacy counter from the previous schema, retained so historical totals aren't lost.
    clickCount: { type: Number, default: 0 },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Serving query: active ads for one placement, best priority first, then manual sort order.
adSchema.index({ isActive: 1, placement: 1, priority: -1, sortOrder: 1 });
adSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

adSchema.virtual('ctr').get(function ctr() {
  if (!this.impressions) return 0;
  return Math.round((this.clicks / this.impressions) * 1000) / 10; // one decimal place, as a %
});

adSchema.set('toJSON', { virtuals: true });
adSchema.set('toObject', { virtuals: true });

module.exports = {
  Ad: mongoose.model('Ad', adSchema),
  AD_TYPES,
  AD_PLACEMENTS,
  AD_DEVICES,
  AD_FREQUENCIES,
  AD_PAGES,
};
