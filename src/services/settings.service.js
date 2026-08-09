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

async function getSettings() {
  const settings = await getSettingsDoc();
  // Config that lives in the environment rather than the database, merged in so the client
  // has one place to read site configuration from.
  return { ...settings, discordUrl: env.discordUrl || settings.socialLinks?.discord || '' };
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
