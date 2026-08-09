// Creates (or resets) a throwaway verified customer for local end-to-end checks.
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../src/config/db');
const { env } = require('../src/config/env');
const User = require('../src/models/User');

const EMAIL = 'e2e-customer@accvendor.local';
const PASSWORD = 'E2eTest!2026';

(async () => {
  await connectDB();
  const passwordHash = await bcrypt.hash(PASSWORD, env.bcryptSaltRounds);
  await User.findOneAndUpdate(
    { email: EMAIL },
    {
      $set: {
        email: EMAIL,
        name: 'E2E Customer',
        passwordHash,
        isVerified: true,
        role: 'user',
        isBlocked: false,
        securityQuestion: 'What city were you born in?',
        securityAnswerHash: await bcrypt.hash('lahore', env.bcryptSaltRounds),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`[e2e] ready: ${EMAIL} / ${PASSWORD}`);
  await disconnectDB();
})();
