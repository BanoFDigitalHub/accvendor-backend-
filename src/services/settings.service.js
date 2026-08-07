const Settings = require('../models/Settings');

async function getSettings() {
  const settings = await Settings.findOneAndUpdate(
    { singleton: 'main' },
    { $setOnInsert: { singleton: 'main' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
  return settings;
}

async function updateSettings(patch) {
  const settings = await Settings.findOneAndUpdate(
    { singleton: 'main' },
    { $set: patch },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  return settings;
}

module.exports = { getSettings, updateSettings };
