const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, required: true, trim: true },
    images: { type: [String], default: [] },
    tags: { type: [String], default: [] },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },

    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, default: null, min: 0 },
    // Optional manual overrides so the admin can set an exact USD/EUR price per product instead
    // of relying on Settings.usdRate/eurRate's flat conversion. Null falls back to that rate.
    usdPrice: { type: Number, default: null, min: 0 },
    eurPrice: { type: Number, default: null, min: 0 },

    // Subscription/license validity duration in days (e.g. 30 for a 1-month plan)
    durationDays: { type: Number, required: true, min: 1 },

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
productSchema.index({ name: 'text', description: 'text' });

productSchema.virtual('effectivePrice').get(function effectivePrice() {
  return this.salePrice != null ? this.salePrice : this.price;
});

productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
