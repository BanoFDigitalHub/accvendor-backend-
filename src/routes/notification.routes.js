const express = require('express');
const { makeController } = require('../controllers/notification.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} = require('../validators/notification.validator');

const controller = makeController('user');
const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: listNotificationsQuerySchema }), controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validate({ params: notificationIdParamsSchema }), controller.markRead);

module.exports = router;
