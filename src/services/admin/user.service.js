const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');

function toAdminUser(u) {
  return {
    _id: u._id,
    email: u.email,
    role: u.role,
    isVerified: u.isVerified,
    isBlocked: u.isBlocked,
    createdAt: u.createdAt,
  };
}

async function listUsers({ page, limit, search }) {
  const filter = {};
  if (search) filter.email = { $regex: search.trim(), $options: 'i' };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items: items.map(toAdminUser), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function setBlocked(userId, isBlocked) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(400, 'Cannot block an admin account');

  user.isBlocked = isBlocked;
  // Bumping tokenVersion invalidates every outstanding access/refresh token for this user
  // immediately, rather than waiting for the 15m access token to expire naturally.
  user.tokenVersion += 1;
  await user.save();
  return toAdminUser(user);
}

module.exports = { listUsers, setBlocked };
