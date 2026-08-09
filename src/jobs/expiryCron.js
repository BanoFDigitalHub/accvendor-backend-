const cron = require('node-cron');
const { env } = require('../config/env');
const { markExpiredOrders, sendExpiryReminders, expireUnpaidOrders } = require('../services/order.service');
const { autoCloseInactiveTickets } = require('../services/supportTicket.service');

const tasks = [];

/**
 * Wraps a sweep so one failing job can never take the process down or stop the others.
 * Every sweep is idempotent, so a skipped run is always recoverable by the next one.
 */
function guarded(label, fn) {
  return async function run() {
    try {
      const result = await fn();
      if (result) console.log(`[cron] ${label}: ${result}`);
    } catch (err) {
      console.error(`[cron] ${label} failed:`, err);
    }
  };
}

const runExpiryCheck = guarded('subscription expiry', async () => {
  const expired = await markExpiredOrders();
  const reminded = await sendExpiryReminders();
  return expired || reminded ? `${expired} order(s) expired, ${reminded} reminder(s) sent` : '';
});

// Runs every minute so the payment window is honoured to the minute. The query is covered by
// the (status, paymentDueAt) index and matches nothing on almost every run.
const runUnpaidSweep = guarded('unpaid orders', async () => {
  const count = await expireUnpaidOrders();
  return count ? `${count} unpaid order(s) expired` : '';
});

const runTicketAutoClose = guarded('ticket auto-close', async () => {
  const count = await autoCloseInactiveTickets();
  return count ? `${count} inactive ticket(s) closed` : '';
});

function startExpiryCron() {
  if (tasks.length) return tasks;
  tasks.push(cron.schedule(env.expiryCronSchedule, runExpiryCheck));
  tasks.push(cron.schedule(env.unpaidOrderCronSchedule, runUnpaidSweep));
  tasks.push(cron.schedule(env.ticketAutoCloseCronSchedule, runTicketAutoClose));
  console.log(
    `[cron] scheduled — expiry "${env.expiryCronSchedule}", unpaid "${env.unpaidOrderCronSchedule}" ` +
      `(${env.unpaidOrderWindowMinutes}m window), ticket auto-close "${env.ticketAutoCloseCronSchedule}" ` +
      `(${env.ticketAutoCloseHours}h)`
  );
  return tasks;
}

function stopExpiryCron() {
  while (tasks.length) tasks.pop().stop();
}

module.exports = { startExpiryCron, stopExpiryCron, runExpiryCheck, runUnpaidSweep, runTicketAutoClose };
