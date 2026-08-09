const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const notifications = require('../services/notification.service');

// One controller serves both shells; `audience` is bound by the route that mounts it, never
// taken from the request, so a customer cannot ask for the admin feed.
function makeController(audience) {
  const list = asyncHandler(async (req, res) => {
    const { page, limit, filter } = req.query;
    const result = await notifications.list({ audience, viewerId: req.user._id, page, limit, filter });
    apiResponse(res, 200, 'Notifications fetched', {
      notifications: result.items,
      unreadCount: result.unreadCount,
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
    });
  });

  const unreadCount = asyncHandler(async (req, res) => {
    const count = await notifications.countUnread({ audience, viewerId: req.user._id });
    apiResponse(res, 200, 'Unread count fetched', { unreadCount: count });
  });

  const markRead = asyncHandler(async (req, res) => {
    const ok = await notifications.markRead({ audience, viewerId: req.user._id, notificationId: req.params.id });
    if (!ok) throw new ApiError(404, 'Notification not found');
    apiResponse(res, 200, 'Notification marked as read', null);
  });

  const markAllRead = asyncHandler(async (req, res) => {
    const updated = await notifications.markAllRead({ audience, viewerId: req.user._id });
    apiResponse(res, 200, 'All notifications marked as read', { updated });
  });

  return { list, unreadCount, markRead, markAllRead };
}

module.exports = { makeController };
