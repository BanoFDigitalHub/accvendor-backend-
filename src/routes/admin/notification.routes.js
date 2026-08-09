const express = require('express');
const { makeController } = require('../../controllers/notification.controller');
const validate = require('../../middlewares/validate.middleware');
const {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} = require('../../validators/notification.validator');

// Mounted under /api/admin, which already enforces requireAdminAuth. The 'admin' audience is
// bound here rather than read from the request, so this router can only ever serve the admin
// feed — read state is tracked per-admin because one row is shared by every admin.
const controller = makeController('admin');
const router = express.Router();

router.get('/', validate({ query: listNotificationsQuerySchema }), controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validate({ params: notificationIdParamsSchema }), controller.markRead);

module.exports = router;
