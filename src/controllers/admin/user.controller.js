const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const userService = require('../../services/admin/user.service');

const list = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query);
  apiResponse(res, 200, 'Users fetched', {
    users: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
});

const block = asyncHandler(async (req, res) => {
  const user = await userService.setBlocked(req.params.id, true, req.body.reason);
  apiResponse(res, 200, 'User blocked', { user });
});

const unblock = asyncHandler(async (req, res) => {
  const user = await userService.setBlocked(req.params.id, false);
  apiResponse(res, 200, 'User unblocked', { user });
});

module.exports = { list, block, unblock };
