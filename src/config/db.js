const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    maxPoolSize: 50,
  });
  console.log(`[db] connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err);
  });
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };
