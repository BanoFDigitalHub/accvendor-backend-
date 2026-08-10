const { Order } = require('../../models/Order');
const User = require('../../models/User');
const { SupportTicket } = require('../../models/SupportTicket');
const { getIo } = require('../socket.service');

async function getStats() {
  const [totalUsers, pendingApprovals, activeSubscriptions, openTickets, cancelRequests, revenueAgg] =
    await Promise.all([
      User.countDocuments({}),
      Order.countDocuments({ status: { $in: ['proof_submitted', 'under_review'] } }),
      Order.countDocuments({ status: 'delivered' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'answered'] } }),
      // The flat `cancelRequested` boolean became the cancelRequest sub-document; matching on the
      // old name silently counted zero, so the dashboard tile never showed a pending request.
      Order.countDocuments({ 'cancelRequest.status': 'pending', status: 'delivered' }),
      Order.aggregate([
        { $match: { status: { $in: ['approved', 'delivered', 'expired'] } } },
        // Summed via the PKR mirror, never raw `total` — orders are placed in three currencies
        // and adding those together adds dollars to rupees. `$ifNull` covers pre-migration rows,
        // which were all PKR-denominated anyway.
        { $group: { _id: null, total: { $sum: { $ifNull: ['$totalPKR', '$total'] } }, count: { $sum: 1 } } },
      ]),
    ]);

  let liveVisitors = 0;
  try {
    liveVisitors = getIo().engine.clientsCount;
  } catch {
    liveVisitors = 0;
  }

  const revenue = revenueAgg[0] || { total: 0, count: 0 };

  return {
    totalUsers,
    pendingApprovals,
    activeSubscriptions,
    openTickets,
    cancelRequests,
    totalRevenue: revenue.total,
    totalOrders: revenue.count,
    liveVisitors,
  };
}

async function getRevenueSeries(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await Order.aggregate([
    { $match: { status: { $in: ['approved', 'delivered', 'expired'] }, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        // PKR mirror, same reason as the total above: a day mixing a $20 order and a Rs 5,000
        // order cannot be summed on the raw amounts.
        revenue: { $sum: { $ifNull: ['$totalPKR', '$total'] } },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, revenue: r.revenue, orders: r.orders }));
}

module.exports = { getStats, getRevenueSeries };
