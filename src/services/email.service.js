const nodemailer = require('nodemailer');
const { env } = require('../config/env');

// "replace_me" is the literal placeholder shipped in .env.example — treat it as unset so a
// freshly-copied .env that hasn't been filled in yet still falls back to the console stub
// instead of attempting a real SMTP connection with garbage credentials.
const isPlaceholder = (v) => !v || v === 'replace_me';
const isConfigured = Boolean(env.smtp.host) && !isPlaceholder(env.smtp.user) && !isPlaceholder(env.smtp.pass);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
} else {
  console.warn(
    '[email] SMTP not configured — emails will be logged to the console instead of sent.\n' +
      '[email] To enable real delivery, set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM in server/.env (e.g. Brevo or Resend SMTP credentials).'
  );
}

function logStub(to, subject, html) {
  // Dev-only: strip tags to a rough text preview so OTPs/links are visible without real SMTP.
  const preview = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`\n[email:stub] To: ${to}\n[email:stub] Subject: ${subject}\n[email:stub] Preview: ${preview}\n`);
}

async function sendMail({ to, subject, html }) {
  if (!isConfigured) {
    logStub(to, subject, html);
    return { stubbed: true };
  }

  try {
    return await transporter.sendMail({ from: env.smtp.from, to, subject, html });
  } catch (err) {
    // Email delivery must never take down the user-facing action that triggered it
    // (signup, password reset, etc.) — degrade to the console stub and keep going.
    console.error(`[email] send failed, falling back to console stub: ${err.message}`);
    logStub(to, subject, html);
    return { stubbed: true, error: err.message };
  }
}

module.exports = { sendMail, isConfigured };
