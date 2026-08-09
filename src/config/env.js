// CREDENTIAL_URL_SECRET and TOTP_SHARE_SECRET are required rather than warned about, because
// their fallbacks are values published in this repository. Booting production without them
// means anyone can forge a signed credential-download URL for any buyer's order, and anyone
// with a copy of the database can decrypt every shared 2FA secret. A warning in a log nobody
// reads is not a proportionate response to either.
const requiredInProd = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CREDENTIAL_URL_SECRET',
  'TOTP_SHARE_SECRET',
];

const rawOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

/**
 * The one public URL to put in emails and share links.
 *
 * CLIENT_URL is a whitelist, so it legitimately contains several origins — often with
 * localhost among them so a developer can work against the deployed API. Taking the first
 * entry blindly meant that on a deployment whose CLIENT_URL happened to start with
 * localhost, every password-reset link, order link and 2FA share URL sent to a real customer
 * pointed at their own machine. Outside development, skip loopback origins.
 */
function publicClientUrl() {
  const isLoopback = (o) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(o);
  if ((process.env.NODE_ENV || 'development') === 'development') return rawOrigins[0];
  return rawOrigins.find((o) => !isLoopback(o)) || rawOrigins[0];
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: publicClientUrl(),
  clientOrigins: rawOrigins,
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

  // Public URL of the logo used inside transactional emails. Mail clients cannot resolve a
  // local filesystem path or a relative URL, so this has to be an absolute, publicly reachable
  // image or the logo silently renders as a broken image for every recipient.
  emailLogoUrl: process.env.EMAIL_LOGO_URL || 'https://accvendor.vercel.app/logo.jpeg',

  otpExpiresMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES, 10) || 10,
  // Deliberately short (5s): long enough to collapse a burst of double-clicks into one send,
  // short enough that a customer who genuinely didn't get the mail isn't left waiting. The
  // per-IP/per-email rate limiters are what stop sustained abuse, not this.
  otpResendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 5,
  signupCooldownSeconds: parseInt(process.env.SIGNUP_COOLDOWN_SECONDS, 10) || 5,
  otpMaxVerifyAttempts: parseInt(process.env.OTP_MAX_VERIFY_ATTEMPTS, 10) || 5,
  otpVerifyLockMinutes: parseInt(process.env.OTP_VERIFY_LOCK_MINUTES, 10) || 15,
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
    // Write-side buckets for the repeatable customer actions. Each is generous enough that
    // normal use never notices, tight enough that a stuck retry loop or a script can't turn
    // into unbounded database writes.
    orderMax: parseInt(process.env.RATE_LIMIT_ORDER_MAX, 10) || 20, // per 10 min
    reviewMax: parseInt(process.env.RATE_LIMIT_REVIEW_MAX, 10) || 10, // per hour
    ticketMax: parseInt(process.env.RATE_LIMIT_TICKET_MAX, 10) || 15, // per hour
    // Search is read-only and debounced client-side, so this only exists to bound a
    // pathological client — it is per minute, not per window.
    searchMax: parseInt(process.env.RATE_LIMIT_SEARCH_MAX, 10) || 120,
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

  // How long an order may sit unpaid before the sweep expires it. Enforced by the cron below
  // against Order.paymentDueAt — never by a browser timer, which a refresh would reset.
  unpaidOrderWindowMinutes: parseInt(process.env.UNPAID_ORDER_WINDOW_MINUTES, 10) || 60,
  // Runs every minute so the 60-minute window is honoured to the minute rather than to the
  // next daily sweep. The query is index-covered (status + paymentDueAt) and matches nothing
  // almost every time it runs.
  unpaidOrderCronSchedule: process.env.UNPAID_ORDER_CRON_SCHEDULE || '* * * * *',

  // A ticket the admin has answered auto-closes after this much customer silence.
  ticketAutoCloseHours: parseInt(process.env.TICKET_AUTO_CLOSE_HOURS, 10) || 48,
  ticketAutoCloseCronSchedule: process.env.TICKET_AUTO_CLOSE_CRON_SCHEDULE || '15 * * * *',

  // Encrypts TOTP secrets held for shareable 2FA links (AES-256-GCM, see utils/crypto.util.js).
  // Changing it makes every existing share link undecryptable, which is the intended kill switch.
  totpShareSecret: process.env.TOTP_SHARE_SECRET || 'dev_totp_share_secret_change_me',
  totpShareExpiresHours: parseInt(process.env.TOTP_SHARE_EXPIRES_HOURS, 10) || 24,

  // Surfaced in the storefront footer/support area and the admin sidebar. Blank hides the link.
  discordUrl: process.env.DISCORD_URL || '',
  // Shown in the email footer. Kept in step with Settings.footer.copyrightYear (the storefront
  // footer) so a customer never sees two different years across the site and its emails.
  copyrightYear: process.env.COPYRIGHT_YEAR || '2024',

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@accvendor.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
};

// Secrets that have a working dev default but must not keep it in production. These warn
// loudly rather than refusing to boot: an existing deploy that hasn't set them yet should
// come up with the feature degraded, not go dark entirely.
const warnIfDefaultInProd = [
  ['EMAIL_LOGO_URL', 'transactional emails fall back to the default logo URL'],
  ['RESEND_API_KEY', 'email falls back to SMTP, which Render blocks — signup OTPs will not arrive'],
  ['DISCORD_URL', 'the Discord link is hidden until it is set here or in Admin → Settings'],
];

function assertProdEnv() {
  if (env.nodeEnv !== 'production') return;
  const missing = requiredInProd.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
  for (const [key, consequence] of warnIfDefaultInProd) {
    if (!process.env[key]) {
      console.warn(`[env] ${key} is not set in production — ${consequence}.`);
    }
  }
}

module.exports = { env, assertProdEnv };
