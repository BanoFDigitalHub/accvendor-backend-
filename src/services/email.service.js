const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { LOGO_CID } = require('../utils/emailTemplates');

/**
 * The brand mark, sent **inside** the message rather than fetched from the web.
 *
 * Gmail, Outlook and Apple Mail all block remote images by default for a sender the recipient
 * has never replied to — which is every transactional email a new customer gets. The URL was
 * reachable and the markup was correct; the client simply refused to fetch it, and what the
 * reader saw where the logo should be was a placeholder icon. Nothing about the HTML can fix
 * that, because the decision is made before the request is ever sent.
 *
 * An inline attachment referenced as `cid:` is part of the message, so there is no request to
 * block. Read once at boot: it is a 13KB file and re-reading it per send would be pure I/O on
 * the signup path.
 *
 * If the file is missing — a partial deploy, a build that dropped `src/assets` — the reference
 * is rewritten to the public URL on the way out rather than left as a dead `cid:`, so the worst
 * case is the behaviour we had before instead of a broken image in every email.
 */
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'email-logo.png');
let logoBase64 = null;
try {
  logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
} catch {
  console.warn(
    `[email] ${path.relative(process.cwd(), LOGO_PATH)} is missing — the logo will be linked from ` +
      `${env.emailLogoUrl} instead, which most mail clients block by default.`
  );
}

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

/**
 * Resolves the `cid:` logo reference for a message about to go out.
 *
 * Returns the HTML to send plus the attachment it needs, or no attachment and a rewritten `src`
 * when the asset could not be read. Templates always write `cid:`; this is the only place that
 * knows whether the message can actually carry it.
 */
function withInlineLogo(html) {
  const cidRef = `cid:${LOGO_CID}`;
  if (!html.includes(cidRef)) return { html, inlineLogo: null };
  if (!logoBase64) return { html: html.split(cidRef).join(env.emailLogoUrl), inlineLogo: null };
  return { html, inlineLogo: { filename: 'logo.png', contentType: 'image/png', base64: logoBase64 } };
}

async function sendViaResend({ to, subject, html }) {
  const { html: body, inlineLogo } = withInlineLogo(html);
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
      html: body,
      // Derived from the original HTML — the plain-text alternative has no images either way.
      text: htmlToText(html),
      // `content_id` is what makes Resend treat this as inline rather than as a file the reader
      // has to download. Without it the logo arrives as a paperclip attachment and the header
      // renders empty, which is worse than the linked image it replaced.
      ...(inlineLogo
        ? {
            attachments: [
              {
                filename: inlineLogo.filename,
                content: inlineLogo.base64,
                content_type: inlineLogo.contentType,
                content_id: LOGO_CID,
              },
            ],
          }
        : {}),
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
  const { html: body, inlineLogo } = withInlineLogo(html);
  let timer;
  try {
    return await Promise.race([
      transporter.sendMail({
        from: env.emailFrom,
        to,
        subject,
        html: body,
        text: htmlToText(html),
        // nodemailer spells the same thing `cid`, and infers multipart/related from its presence.
        ...(inlineLogo
          ? {
              attachments: [
                {
                  filename: inlineLogo.filename,
                  content: Buffer.from(inlineLogo.base64, 'base64'),
                  contentType: inlineLogo.contentType,
                  cid: LOGO_CID,
                },
              ],
            }
          : {}),
      }),
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
