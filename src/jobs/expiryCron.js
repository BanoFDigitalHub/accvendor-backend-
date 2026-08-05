const cron = require('node-cron');
const { env } = require('../config/env');
const { markExpiredOrders, sendExpiryReminders } = require('../services/order.service');

let task = null;

async function runExpiryCheck() {
  try {
    const expired = await markExpiredOrders();
    const reminded = await sendExpiryReminders();
    console.log(`[cron] expiry check: ${expired} order(s) expired, ${reminded} reminder(s) sent`);
  } catch (err) {
    console.error('[cron] expiry check failed:', err);
  }
}

function startExpiryCron() {
  if (task) return task;
  task = cron.schedule(env.expiryCronSchedule, runExpiryCheck);
  return task;
}

function stopExpiryCron() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { startExpiryCron, stopExpiryCron, runExpiryCheck };
