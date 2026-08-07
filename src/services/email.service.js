const nodemailer = require('nodemailer');
const { env } = require('../config/env');

// "replace_me" is the literal placeholder shipped in .env.example — treat it as unset so a
// freshly-copied .env that hasn't been filled in yet still falls back to the console stub
// instead of attempting a real send with garbage credentials.
const isPlaceholder = (v) => !v || v === 'replace_me';

// Two transports, tried in this order:
//   1. Resend — an HTTPS API on port 443. Preferred because hosts that block outbound SMTP
//      (Render's free tier blocks 25/465/587) can still reach it.
//   2. SMTP — for self-hosted deploys that can open those ports.
// Neither configured → console stub, so the app always boots and OTPs stay visible in logs.
const resendConfigured = !isPlaceholder(env.resend.apiKey);
const smtpConfigured =
  Boolean(env.smtp.host) && !isPlaceholder(env.smtp.user) && !isPlaceholder(env.smtp.pass);
const isConfigured = resendConfigured || smtpConfigured;

// Nodemailer's defaults (2min connect, 10min socket) are far longer than the client's 20s
// request timeout, so a host that silently drops outbound SMTP hangs signup until the browser
// aborts instead of failing. These caps keep the whole attempt inside the request budget.
const SMTP_CONNECTION_TIMEOUT_MS = 8000;
const SMTP_SOCKET_TIMEOUT_MS = 8000;
// Belt-and-braces: transport options don't cover every stall (DNS resolution, a TLS handshake
// that neither connects nor errors), so cap the whole send independently.
const SEND_TIMEOUT_MS = 10000;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });
}

if (resendConfigured) {
  console.log(`[email] Using Resend (HTTPS API) — from: ${env.emailFrom}`);
  if (/@resend\.dev>?\s*$/.test(env.emailFrom)) {
    console.warn(
      '[email] EMAIL_FROM still uses the shared resend.dev sender — Resend will only deliver to\n' +
        '[email] the address that owns the API key. Verify a domain and set EMAIL_FROM to it to\n' +
        '[email] reach real customers.'
    );
  }
} else if (smtpConfigured) {
  console.log(`[email] Using SMTP ${env.smtp.host}:${env.smtp.port} — from: ${env.emailFrom}`);
} else {
  console.warn(
    '[email] No email transport configured — emails will be logged to the console instead of sent.\n' +
      '[email] Set RESEND_API_KEY (recommended), or SMTP_HOST/SMTP_USER/SMTP_PASS, plus EMAIL_FROM.'
  );
}

function logStub(to, subject, html) {
  // Strips tags to a rough text preview so OTPs/links stay visible without a real transport.
  const preview = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`\n[email:stub] To: ${to}\n[email:stub] Subject: ${subject}\n[email:stub] Preview: ${preview}\n`);
}

// A text/plain alternative measurably helps deliverability — spam filters penalise HTML-only
// mail — so derive one rather than shipping the HTML alone.
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    // Hidden preheader/spacer divs carry zero-width padding entities that would otherwise
    // land as literal junk at the top of the plain-text body.
    .replace(/<div[^>]*display:\s*none[\s\S]*?<\/div>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendViaResend({ to, subject, html }) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [to],
      subject,
      html,
      text: htmlToText(html),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resend reports failures as 4xx/5xx JSON, not a thrown error — surface the real reason
    // (unverified domain, invalid key) instead of a generic "send failed".
    throw new Error(`Resend ${res.status}: ${payload.message || res.statusText}`);
  }
  return { id: payload.id, provider: 'resend' };
}

async function sendViaSmtp({ to, subject, html }) {
  let timer;
  try {
    return await Promise.race([
      transporter.sendMail({ from: env.emailFrom, to, subject, html, text: htmlToText(html) }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function sendMail({ to, subject, html }) {
  if (!isConfigured) {
    logStub(to, subject, html);
    return { stubbed: true };
  }

  try {
    return resendConfigured ? await sendViaResend({ to, subject, html }) : await sendViaSmtp({ to, subject, html });
  } catch (err) {
    // Email delivery must never take down the user-facing action that triggered it
    // (signup, password reset, etc.) — degrade to the console stub and keep going.
    console.error(`[email] send failed, falling back to console stub: ${err.message}`);
    logStub(to, subject, html);
    return { stubbed: true, error: err.message };
  }
}

module.exports = { sendMail, isConfigured };
