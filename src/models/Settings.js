const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'main', unique: true },
    siteName: { type: String, default: 'Accvendor', trim: true },
    siteTagline: { type: String, default: '', trim: true },
    aboutContent: { type: String, default: '', trim: true },
    contactEmail: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    usdRate: { type: Number, default: 280, min: 0 },
    eurRate: { type: Number, default: 305, min: 0 },
    socialLinks: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      telegram: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
