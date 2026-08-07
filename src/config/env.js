const requiredInProd = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim(),
  clientOrigins: (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  apiUrl: process.env.API_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 5000}/api`,

  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME || 'accvendor',

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpiresDays: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS, 10) || 7,

  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  // In production the API and the site are usually on different domains (Render + the
  // storefront host), which makes every auth request cross-site: the session cookie is only
  // sent if it is SameSite=None; Secure. Locally both are on localhost, so Lax is correct
  // and avoids requiring HTTPS. Override with COOKIE_SAMESITE if you host both on one domain.
  cookieSameSite: process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),

  // Resend delivers over HTTPS (port 443), which is why it is the preferred transport: many
  // hosts — Render's free tier among them — block outbound SMTP ports (25/465/587) outright,
  // so a plain SMTP transport there hangs until it times out. SMTP stays as the fallback for
  // self-hosted deploys that can reach it.
  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  // Shared by both transports. Until a domain is verified in Resend, this must stay
  // onboarding@resend.dev — and Resend will then only deliver to the account owner's address.
  emailFrom: process.env.EMAIL_FROM || 'Accvendor <onboarding@resend.dev>',

  otpExpiresMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES, 10) || 10,
  otpResendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60,
  resetTokenExpiresMinutes: parseInt(process.env.RESET_TOKEN_EXPIRES_MINUTES, 10) || 15,

  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,

  loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5,
  loginLockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES, 10) || 15,

  // Request-rate caps. The global bucket counts *every* API call, and a single page view
  // costs several (settings, categories, products, cart, ...), so it has to be generous —
  // an SSG build or a few minutes of normal browsing otherwise trips it. The auth/OTP
  // buckets stay tight because those are the ones that actually protect accounts.
  rateLimit: {
    globalWindowMinutes: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MINUTES, 10) || 15,
    globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10) || 3000,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 20,
    uploadMax: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX, 10) || 60,
    otpMax: parseInt(process.env.RATE_LIMIT_OTP_MAX, 10) || 10,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  credentialUrlSecret: process.env.CREDENTIAL_URL_SECRET || 'dev_credential_secret_change_me',
  credentialUrlExpiresMinutes: parseInt(process.env.CREDENTIAL_URL_EXPIRES_MINUTES, 10) || 60,

  expiryReminderDaysBefore: parseInt(process.env.EXPIRY_REMINDER_DAYS_BEFORE, 10) || 3,
  expiryCronSchedule: process.env.EXPIRY_CRON_SCHEDULE || '0 6 * * *',

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@accvendor.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
};

function assertProdEnv() {
  if (env.nodeEnv !== 'production') return;
  const missing = requiredInProd.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
}

module.exports = { env, assertProdEnv };
