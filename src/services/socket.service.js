const { Server } = require('socket.io');
const { env } = require('../config/env');
const { verifyAccessToken, SCOPE_SITE, SCOPE_ADMIN } = require('../utils/token.util');
const { cookieNames } = require('../utils/cookie.util');
const User = require('../models/User');

let io = null;

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    // Same whitelist as the REST CORS layer: the storefront and the admin panel are deployed
    // on separate domains, so both origins must be allowed here or the admin bell never connects.
    cors: { origin: env.clientOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie;
      // The connection is scoped by which cookie it presents. An admin cookie only ever
      // yields the admin feed; a site cookie only ever yields that user's own feed. A
      // browser holding both gets two independent connections, never a merged one.
      const wanted = socket.handshake.auth?.scope === SCOPE_ADMIN ? SCOPE_ADMIN : SCOPE_SITE;
      const token = parseCookie(cookie, cookieNames(wanted).access);
      if (!token) return next(); // anonymous connection allowed, just gets no rooms

      const payload = verifyAccessToken(token);
      if (payload.scope !== wanted) return next();

      const user = await User.findById(payload.sub).lean();
      if (user && user.tokenVersion === payload.tokenVersion && !user.isBlocked) {
        socket.data.scope = wanted;
        socket.data.userId = String(user._id);
        socket.data.role = user.role;
      }
      next();
    } catch {
      next(); // invalid/expired token: connect anonymously rather than reject
    }
  });

  io.on('connection', (socket) => {
    if (!socket.data.userId) return;
    if (socket.data.scope === SCOPE_ADMIN) {
      if (socket.data.role === 'admin') socket.join('admins');
      return;
    }
    socket.join(`user:${socket.data.userId}`);
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
