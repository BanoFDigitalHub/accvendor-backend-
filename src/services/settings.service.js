const Settings = require('../models/Settings');
const { env } = require('../config/env');
const { DEFAULT_CURRENCY } = require('../utils/money');

// Currency rates are read on nearly every product query. They change only when an admin edits
// them, so a very short in-process cache removes that per-request round trip without letting a
// rate edit take visibly long to appear. Invalidated eagerly on write.
const RATES_CACHE_MS = 5000;
let ratesCache = null;
let ratesCachedAt = 0;

async function getSettingsDoc() {
  return Settings.findOneAndUpdate(
    { singleton: 'main' },
    { $setOnInsert: { singleton: 'main' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
}

/**
 * Defaults for sub-documents added after the singleton row was first written.
 *
 * `getSettingsDoc()` reads `.lean()`, and a lean read returns the raw document — Mongoose fills
 * schema defaults in *memory* on a hydrated read, not on disk, so a nested block that has never
 * been saved comes back as `undefined` rather than as its defaults. That is the same trap
 * `migrate.js` documents, and it is why the storefront's support strip silently did not exist
 * on any install that had ever saved its settings before the field was added.
 *
 * Filling them in here rather than in each consumer means the client has exactly one shape to
 * read, whether the row is a fresh insert (which does get defaults, via `setDefaultsOnInsert`)
 * or five years old.
 */
const SUPPORT_DEFAULTS = {
  showHours: true,
  alwaysOpen: true,
  opensAt: '09:00',
  closesAt: '21:00',
  note: '',
};

async function getSettings() {
  const settings = await getSettingsDoc();
  // Config that lives in the environment rather than the database, merged in so the client
  // has one place to read site configuration from.
  return {
    ...settings,
    support: { ...SUPPORT_DEFAULTS, ...(settings.support || {}) },
    discordUrl: env.discordUrl || settings.socialLinks?.discord || '',
  };
}

async function getRates() {
  if (ratesCache && Date.now() - ratesCachedAt < RATES_CACHE_MS) return ratesCache;
  const settings = await getSettingsDoc();
  ratesCache = {
    usdRate: settings.usdRate,
    eurRate: settings.eurRate,
    defaultCurrency: settings.defaultCurrency || DEFAULT_CURRENCY,
  };
  ratesCachedAt = Date.now();
  return ratesCache;
}

function invalidateRatesCache() {
  ratesCache = null;
  ratesCachedAt = 0;
}

async function updateSettings(patch) {
  const settings = await Settings.findOneAndUpdate(
    { singleton: 'main' },
    { $set: patch },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  invalidateRatesCache();
  return settings;
}

module.exports = { getSettings, getSettingsDoc, getRates, invalidateRatesCache, updateSettings };
