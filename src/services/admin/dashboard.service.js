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
      Order.countDocuments({ cancelRequested: true, status: 'delivered' }),
      Order.aggregate([
        { $match: { status: { $in: ['approved', 'delivered', 'expired'] } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
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
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, revenue: r.revenue, orders: r.orders }));
}

module.exports = { getStats, getRevenueSeries };
