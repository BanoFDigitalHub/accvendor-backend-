const express = require('express');
const { requireAuth, requireRole } = require('../../middlewares/auth.middleware');
const auditLog = require('../../middlewares/auditLog.middleware');

const dashboardRoutes = require('./dashboard.routes');
const catalogRoutes = require('./catalog.routes');
const userRoutes = require('./user.routes');
const orderRoutes = require('./order.routes');
const ticketRoutes = require('./ticket.routes');
const reviewRoutes = require('./review.routes');
const adRoutes = require('./ad.routes');
const settingsRoutes = require('./settings.routes');
const auditLogRoutes = require('./auditLog.routes');
const twoFactorRoutes = require('./twoFactor.routes');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));
router.use(auditLog);

router.use('/dashboard', dashboardRoutes);
router.use('/', catalogRoutes); // /products, /categories, /coupons, /payment-methods
router.use('/users', userRoutes);
router.use('/orders', orderRoutes);
router.use('/support/tickets', ticketRoutes);
router.use('/reviews', reviewRoutes);
router.use('/ads', adRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit-log', auditLogRoutes);
router.use('/2fa', twoFactorRoutes);

module.exports = router;
