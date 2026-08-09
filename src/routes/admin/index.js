const express = require('express');
const { requireAdminAuth } = require('../../middlewares/auth.middleware');
const auditLog = require('../../middlewares/auditLog.middleware');

const authRoutes = require('./auth.routes');
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
const uploadRoutes = require('./upload.routes');
const notificationRoutes = require('./notification.routes');

const router = express.Router();

// Admin auth lives in front of the guard — it is how you get a session in the first place.
router.use('/auth', authRoutes);

// Everything past this point needs an admin-scoped session. A public-site session, even
// one belonging to an admin account, is rejected here.
router.use(requireAdminAuth);
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
router.use('/uploads', uploadRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
