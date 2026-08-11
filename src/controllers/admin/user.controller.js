const asyncHandler = require('../../utils/asyncHandler');
const apiResponse = require('../../utils/apiResponse');
const userService = require('../../services/admin/user.service');
const adminEmailService = require('../../services/admin/email.service');

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

/**
 * A free-form message to one customer, from the Users page.
 *
 * The address is read from the account row, never from the request body: the admin picks a
 * *user*, not an email address, so this cannot be turned into a way to mail arbitrary third
 * parties. The same call also drops a notification into that customer's dashboard, so the
 * message exists somewhere they can find it even if the email is missed.
 */
const emailCustomer = asyncHandler(async (req, res) => {
  const result = await adminEmailService.emailUser(req.params.id, req.body, req.user);
  apiResponse(res, 200, 'Email sent', result);
});

module.exports = { list, block, unblock, emailCustomer };
