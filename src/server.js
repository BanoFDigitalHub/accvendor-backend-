require('dotenv').config({ quiet: true });
const http = require('http');
const app = require('./app');
const { env, assertProdEnv } = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const { initSocket } = require('./services/socket.service');
const { startExpiryCron, stopExpiryCron } = require('./jobs/expiryCron');

let server;

async function start() {
  assertProdEnv();
  await connectDB();
  server = http.createServer(app);
  initSocket(server);
  server.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`);
  });
  // In PM2 cluster mode every worker process would otherwise run this cron
  // independently, sending each expiry reminder/notification once per worker.
  // NODE_APP_INSTANCE is set by PM2 cluster mode only; run the cron on worker 0
  // (or always, when not running under PM2 at all).
  const isPrimaryInstance = process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0';
  if (env.nodeEnv !== 'test' && isPrimaryInstance) startExpiryCron();
}

async function shutdown(signal) {
  console.log(`\n[server] received ${signal}, shutting down gracefully...`);
  stopExpiryCron();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
