const { Server } = require('socket.io');
const { env } = require('../config/env');
const { verifyAccessToken } = require('../utils/token.util');
const User = require('../models/User');

let io = null;

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie, 'accessToken');
      if (!token) return next(); // anonymous connection allowed, just gets no rooms

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).lean();
      if (user && user.tokenVersion === payload.tokenVersion && !user.isBlocked) {
        socket.data.userId = String(user._id);
        socket.data.role = user.role;
      }
      next();
    } catch {
      next(); // invalid/expired token: connect anonymously rather than reject
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`);
    if (socket.data.role === 'admin') socket.join('admins');
  });

  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.io has not been initialized yet');
  return io;
}

function emitToAdmins(event, payload) {
  if (!io) return;
  io.to('admins').emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, getIo, emitToAdmins, emitToUser };
