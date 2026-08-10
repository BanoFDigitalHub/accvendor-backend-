const mongoose = require('mongoose');

const CURRENCIES = ['PKR', 'USD', 'EUR'];
const DEFAULT_CURRENCY = 'USD';

// A product image is a Cloudinary asset (url + publicId so we can destroy it on replace/delete)
// or a plain pasted URL, in which case publicId stays null and nothing is owned remotely.
const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: null },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, required: true, trim: true },
    // Legacy: a flat array of URL strings. Kept in sync from `media` by the pre-validate hook
    // below so every existing reader (product cards, order snapshots, SSG loaders) keeps working
    // untouched while `media` carries the Cloudinary publicIds the admin UI needs.
    images: { type: [String], default: [] },
    media: { type: [productImageSchema], default: [] },
    tags: { type: [String], default: [] },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },

    // --- Pricing -------------------------------------------------------------------
    // Each currency carries its own authoritative, admin-entered amount. Setting one never
    // overwrites another. `price`/`salePrice` are the PKR pair (field names preserved from the
    // original schema so existing indexes, sorts and documents keep working unchanged).
    // A currency left null falls back to the Settings.usdRate/eurRate conversion at read time —
    // that fallback is a display convenience, never a write: nothing is persisted from it.
    price: { type: Number, required: true, min: 0 }, // PKR
    salePrice: { type: Number, default: null, min: 0 }, // PKR
    usdPrice: { type: Number, default: null, min: 0 },
    usdSalePrice: { type: Number, default: null, min: 0 },
    eurPrice: { type: Number, default: null, min: 0 },
    eurSalePrice: { type: Number, default: null, min: 0 },

    // Subscription/license validity duration in days (e.g. 30 for a 1-month plan).
    // Drives order expiry — distinct from the human-readable `validity` label below.
    durationDays: { type: Number, required: true, min: 1 },

    // Warranty window in days, counted from the moment the order is *delivered*. Deliberately
    // separate from `durationDays`: validity is how long the account keeps working, warranty is
    // how long the buyer may still ask for it to be cancelled/replaced. A 30-day subscription
    // may carry a 7-day warranty, or none at all.
    // 0 means "no warranty window configured" — the cancellation window is then unrestricted,
    // which is what every product predating this field gets, so behaviour is unchanged for them.
    warrantyDays: { type: Number, default: 0, min: 0 },

    // Free-text commercial terms shown on the product page, e.g. "30 Days" / "12 Months".
    // `warranty` is the display label for `warrantyDays`; `validity` the one for `durationDays`.
    warranty: { type: String, trim: true, default: '' },
    validity: { type: String, trim: true, default: '' },

    stock: { type: Number, required: true, min: 0, default: 0 },

    isHotProduct: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Public listing is filtered by isActive + category and sorted newest-first;
// this compound index covers that query shape directly.
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isHotProduct: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
// Admin catalog search is a case-insensitive prefix/substring match on name, which $text
// can't do (it only matches whole stemmed words) — this collated index serves that path.
productSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });

// Keep the legacy `images` string array as the mirror of `media`. Writers may set either one:
// if `media` was touched it wins, otherwise a bare `images` write is lifted into `media`.
// Mongoose 9 document middleware is promise-based — it does not pass a `next` callback — so
// this returns synchronously rather than calling one.
productSchema.pre('validate', function syncImages() {
  if (this.isModified('media')) {
    this.images = (this.media || []).map((m) => m.url);
  } else if (this.isModified('images')) {
    this.media = (this.images || []).map((url) => ({ url, publicId: null }));
  }
});

productSchema.virtual('effectivePrice').get(function effectivePrice() {
  return this.salePrice != null ? this.salePrice : this.price;
});

productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
module.exports.CURRENCIES = CURRENCIES;
module.exports.DEFAULT_CURRENCY = DEFAULT_CURRENCY;
