const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: null, min: 1 }, // null = unlimited total uses
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1, min: 1 },
    expiresAt: { type: Date, default: null },
    applicableProducts: { type: [mongoose.Schema.Types.ObjectId], ref: 'Product', default: [] }, // empty = all products
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
