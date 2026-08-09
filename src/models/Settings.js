const mongoose = require('mongoose');
const { CURRENCIES, DEFAULT_CURRENCY } = require('../utils/money');

// --- Trust / social-proof content ------------------------------------------------------
// Every number rendered in the storefront's trust bar, statistics strip and testimonial grid
// lives here rather than in the JSX, so the admin sets real figures and nothing is hardcoded.
// Each list ships empty; the matching section hides itself entirely when it has no entries.

const ratingProviderSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true }, // 'Google', 'Trustpilot', ...
    rating: { type: Number, required: true, min: 0, max: 5 },
    reviewCount: { type: Number, required: true, min: 0 },
    url: { type: String, default: '', trim: true },
    // Star colour, so Google can render amber and Trustpilot green without a name lookup in JSX.
    accent: { type: String, default: '#f5b301', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const trustBadgeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    sublabel: { type: String, default: '', trim: true },
    iconUrl: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const statSchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true }, // '12,000+' — a string, so '95%' works too
    label: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '', trim: true },
    rating: { type: Number, default: 5, min: 1, max: 5 },
    quote: { type: String, required: true, trim: true, maxlength: 1000 },
    source: { type: String, default: '', trim: true }, // 'Google', 'Trustpilot', 'Verified purchase'
    // Marks demo/seed copy so it can be listed and removed in one action, and never presented
    // as a genuine verified purchase.
    isSeed: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'main', unique: true },
    siteName: { type: String, default: 'Accvendor', trim: true },
    siteTagline: { type: String, default: '', trim: true },
    aboutContent: { type: String, default: '', trim: true },
    contactEmail: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },

    // --- Currency ---------------------------------------------------------------------
    // Rates are PKR per 1 unit, set manually (no live FX feed). They only ever fill in a
    // currency the admin left blank on a product — an explicit price always wins.
    usdRate: { type: Number, default: 280, min: 0 },
    eurRate: { type: Number, default: 305, min: 0 },
    defaultCurrency: { type: String, enum: CURRENCIES, default: DEFAULT_CURRENCY },

    socialLinks: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      telegram: { type: String, default: '' },
      discord: { type: String, default: '' },
    },

    // --- Storefront trust content -------------------------------------------------------
    trust: {
      ratingProviders: { type: [ratingProviderSchema], default: [] },
      badges: { type: [trustBadgeSchema], default: [] },
      stats: { type: [statSchema], default: [] },
      testimonials: { type: [testimonialSchema], default: [] },
      reviewsHeading: { type: String, default: '', trim: true },
      allReviewsUrl: { type: String, default: '', trim: true },
    },

    // --- Footer -------------------------------------------------------------------------
    footer: {
      copyrightYear: { type: String, default: '2024', trim: true },
      creditName: { type: String, default: 'Bano Digital Hub', trim: true },
      creditUrl: { type: String, default: 'https://www.banodigitalhub.pk', trim: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
