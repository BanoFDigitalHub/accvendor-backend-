// Socket.io notifications are NOT cluster-safe as configured: each PM2 worker
// keeps its own in-memory set of connected sockets, so an event emitted from
// the worker handling an admin's approve/reject/deliver action will only reach
// users whose socket connection happens to be pinned to that same worker.
// Fine for `instances: 1` (below); scaling past 1 instance needs a shared
// Socket.io adapter (e.g. @socket.io/redis-adapter) wired into socket.service.js
// first — not added here since that's a new infra dependency (Redis) beyond
// this session's scope.
module.exports = {
  apps: [
    {
      name: 'accvendor-api',
      script: 'src/server.js',
      // Kept at 1 instance until a shared Socket.io adapter is added (see note
      // above) — bump this to 'max' once that's in place to actually use
      // cluster mode across multiple CPU cores.
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      autorestart: true,
      watch: false,
    },
  ],
};
