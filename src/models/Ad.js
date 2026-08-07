const mongoose = require('mongoose');

const AD_TYPES = ['adsterra', 'adsense', 'banner'];

const adSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: AD_TYPES, required: true },
    placement: { type: String, required: true, trim: true, lowercase: true }, // e.g. 'home-top', 'sidebar', 'product-detail'
    code: { type: String, trim: true, default: '' }, // raw Adsterra/AdSense script or embed code
    imageUrl: { type: String, default: null }, // manual banner
    linkUrl: { type: String, default: null }, // manual banner click-through
    clickCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

adSchema.index({ isActive: 1, placement: 1, sortOrder: 1 });

module.exports = { Ad: mongoose.model('Ad', adSchema), AD_TYPES };
