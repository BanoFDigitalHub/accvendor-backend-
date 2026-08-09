const { env } = require('../config/env');
const { formatMoney } = require('./money');

const BRAND = {
  name: 'accvendor.com',
  tagline: 'Accounts for every need',
  navy: '#0b1b33',
  accent: '#036af7',
  accentDark: '#0355c4',
  ink: '#132741',
  muted: '#5a6b80',
  faint: '#8496ab',
  line: '#e2e8f0',
  wash: '#f4f7fb',
  panel: '#eef4fd',
  good: '#0f7b52',
  warn: '#9a5b00',
  bad: '#b3261e',
};

const SITE_URL = env.clientUrl.replace(/\/$/, '');
// Must be an absolute, publicly reachable https URL: a mail client cannot resolve a local
// filesystem path or a relative URL, and a broken logo is what every recipient would see.
// Defaults to the deployed storefront's copy; override with EMAIL_LOGO_URL.
const LOGO_URL = env.emailLogoUrl || `${SITE_URL}/logo.jpeg`;

// Email clients strip <style> unpredictably, so every rule is inline. Kept as short helpers
// rather than repeated literals so a brand tweak is a one-line change.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Every order carries the currency it was placed in, so a receipt always renders the amount
// the buyer actually agreed to — never today's converted equivalent.
function formatPrice(value, currency = 'PKR') {
  return formatMoney(value, currency);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// The customer-facing reference. Falls back to a slice of the id only for pre-migration
// records that never received a number.
function orderRef(order) {
  return order.orderNumber || String(order._id).slice(-8).toUpperCase();
}

function p(text, extra = '') {
  return `<p style="margin:0 0 14px;color:${BRAND.muted};font-size:15px;line-height:1.65;${extra}">${text}</p>`;
}

function strong(text) {
  return `<strong style="color:${BRAND.ink};font-weight:600;">${text}</strong>`;
}

// Outlook (Word rendering engine) ignores padding on <a>, so the VML roundrect gives it a real
// button while every other client gets the anchor. Without this the CTA collapses to bare text.
function button(href, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto;">
    <tr><td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="21%" stroke="f" fillcolor="${BRAND.accent}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" style="display:inline-block;min-width:200px;padding:14px 32px;background:${BRAND.accent};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;text-align:center;text-decoration:none;border-radius:10px;">${label}</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;
}

function pill(label, tone = 'accent') {
  const tones = {
    accent: { bg: BRAND.panel, fg: BRAND.accentDark },
    good: { bg: '#e6f4ee', fg: BRAND.good },
    warn: { bg: '#fdf3e2', fg: BRAND.warn },
    bad: { bg: '#fdeceb', fg: BRAND.bad },
    muted: { bg: BRAND.wash, fg: BRAND.faint },
  };
  const { bg, fg } = tones[tone] || tones.accent;
  return `<span style="display:inline-block;padding:5px 12px;background:${bg};color:${fg};font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;border-radius:999px;">${label}</span>`;
}

// A bordered panel for the things the reader actually came for — the code, the credentials,
// the order summary — so they survive a skim.
function panel(innerHtml, extra = '') {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr><td style="padding:18px 20px;background:${BRAND.wash};border:1px solid ${BRAND.line};border-radius:12px;${extra}">${innerHtml}</td></tr>
  </table>`;
}

function baseTemplate(title, bodyHtml, options = {}) {
  const { preheader = '', footerNote = '', badge = '' } = options;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${title}</title>
    <!--[if mso]>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;width:100%;background:${BRAND.wash};font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <!-- Trailing entities stop Gmail pulling body copy into the inbox preview after the preheader. -->
    <div style="display:none;max-height:0;overflow:hidden;">${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.wash};">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(11,27,51,0.08);">

            <tr>
              <td align="center" style="padding:28px 32px;background:${BRAND.navy};">
                <a href="${SITE_URL}" style="text-decoration:none;">
                  <img src="${LOGO_URL}" width="72" height="72" alt="${BRAND.name}"
                    style="display:block;width:72px;height:72px;border:0;border-radius:14px;" />
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 32px 0;" align="center">
                ${badge ? `<div style="margin:0 0 14px;">${badge}</div>` : ''}
                <h1 style="margin:0;color:${BRAND.ink};font-size:23px;line-height:1.35;font-weight:700;letter-spacing:-0.3px;">${title}</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 30px;color:${BRAND.muted};font-size:15px;line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 26px;background:${BRAND.wash};border-top:1px solid ${BRAND.line};text-align:center;">
                ${footerNote ? `<p style="margin:0 0 14px;color:${BRAND.faint};font-size:13px;line-height:1.6;">${footerNote}</p>` : ''}
                <p style="margin:0;color:${BRAND.ink};font-size:14px;font-weight:700;">${BRAND.name}</p>
                <p style="margin:3px 0 0;color:${BRAND.faint};font-size:12px;">${BRAND.tagline}</p>
                <p style="margin:14px 0 0;color:${BRAND.faint};font-size:11px;line-height:1.6;">
                  &copy; ${env.copyrightYear} ${BRAND.name} &middot; This is an automated message, please don't reply.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function otpEmail(otp, expiresMinutes) {
  // Styles sit on the <td> rather than an inner <div>: Outlook renders cell borders far more
  // reliably, and it keeps the derived plain-text version on one line instead of splitting
  // every digit onto its own row.
  const digits = String(otp)
    .split('')
    .map(
      (d) =>
        `<td width="44" align="center" style="width:44px;height:56px;line-height:56px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:10px;color:${BRAND.ink};font-family:${MONO};font-size:26px;font-weight:700;text-align:center;">${d}</td>`
    )
    .join('');

  const body = `
    ${p('Welcome to Accvendor. Enter the code below to verify your email and finish creating your account.')}
    ${panel(
      `<table role="presentation" cellpadding="0" cellspacing="6" border="0" align="center" style="margin:0 auto;border-collapse:separate;"><tr>${digits}</tr></table>
       <p style="margin:16px 0 0;color:${BRAND.faint};font-size:13px;text-align:center;">Expires in ${expiresMinutes} minutes</p>`,
      'text-align:center;'
    )}
    ${p(`If the boxes don't display, your code is ${strong(otp)}.`, `font-size:13px;`)}
  `;
  return baseTemplate('Verify your email', body, {
    preheader: `${otp} is your Accvendor verification code`,
    badge: pill('Verification'),
    footerNote: "Didn't try to sign up? You can safely ignore this email — no account was created.",
  });
}

function passwordResetEmail(link, expiresMinutes) {
  const body = `
    ${p(`We received a request to reset your Accvendor password. Tap the button below to choose a new one — the link works for the next ${strong(`${expiresMinutes} minutes`)}.`)}
    ${button(link, 'Reset my password')}
    ${p(
      `If the button doesn't work, paste this link into your browser:<br /><a href="${link}" style="color:${BRAND.accent};word-break:break-all;">${link}</a>`,
      `font-size:13px;`
    )}
  `;
  return baseTemplate('Reset your password', body, {
    preheader: 'Reset your Accvendor password',
    badge: pill('Security', 'warn'),
    footerNote: "Didn't request this? Ignore this email — your password stays unchanged.",
  });
}

function orderSummary(order) {
  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid ${BRAND.line};color:${BRAND.ink};font-size:14px;line-height:1.5;">
          ${escapeHtml(i.name)}
          <span style="color:${BRAND.faint};">&times; ${i.quantity}</span>
        </td>
        <td style="padding:11px 0;border-bottom:1px solid ${BRAND.line};color:${BRAND.ink};font-size:14px;text-align:right;white-space:nowrap;">
          ${formatPrice(i.unitPrice * i.quantity, order.currency)}
        </td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
      <tr>
        <td style="padding:0 0 10px;color:${BRAND.faint};font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;">Order ${orderRef(order)}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:collapse;">
      ${rows}
      <tr>
        <td style="padding:14px 0 0;color:${BRAND.ink};font-size:16px;font-weight:700;">Total</td>
        <td style="padding:14px 0 0;color:${BRAND.ink};font-size:16px;font-weight:700;text-align:right;white-space:nowrap;">${formatPrice(order.total, order.currency)}</td>
      </tr>
    </table>`;
}

function orderCreatedEmail(order) {
  const body = `
    ${p('Thanks for your order! Here’s what you bought:')}
    ${orderSummary(order)}
    ${panel(
      `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;">
        <strong>Next step:</strong> complete your payment via ${strong(escapeHtml(order.paymentMethod.name))},
        then upload your payment proof so we can verify it and release your account.
      </p>`
    )}
    ${button(`${SITE_URL}/dashboard`, 'Upload payment proof')}
  `;
  return baseTemplate('Order received', body, {
    preheader: `Order ${orderRef(order)} — ${formatPrice(order.total, order.currency)}. Payment proof needed.`,
    badge: pill('Awaiting payment', 'warn'),
  });
}

function proofSubmittedEmail(order) {
  const body = `
    ${p(`We've received your payment proof for order ${strong(`${orderRef(order)}`)} and our team is reviewing it now.`)}
    ${p("Reviews are usually done within a few hours. We'll email you the moment it's approved.")}
  `;
  return baseTemplate('Payment proof received', body, {
    preheader: `We're reviewing your payment for order ${orderRef(order)}`,
    badge: pill('Under review', 'warn'),
  });
}

function orderApprovedEmail(order) {
  const body = `
    ${p(`Good news — your payment for order ${strong(`${orderRef(order)}`)} has been approved.`)}
    ${p("We're preparing your account details now and will send them over shortly.")}
    ${loginButton('View your order')}
  `;
  return baseTemplate('Payment approved', body, {
    preheader: `Payment approved for order ${orderRef(order)}`,
    badge: pill('Approved', 'good'),
  });
}

function orderRejectedEmail(order) {
  const body = `
    ${p(`Unfortunately we couldn't verify the payment proof for order ${strong(`${orderRef(order)}`)}.`)}
    ${
      order.rejectionReason
        ? panel(
            `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(order.rejectionReason)}</p>`
          )
        : ''
    }
    ${p('You can open a support ticket if you think this was a mistake, or place a new order to try again.')}
    ${button(`${SITE_URL}/dashboard/tickets/new`, 'Contact support')}
  `;
  return baseTemplate('Payment could not be verified', body, {
    preheader: `Action needed on order ${orderRef(order)}`,
    badge: pill('Not verified', 'bad'),
  });
}

function orderDeliveredEmail(order, downloadUrl) {
  const credentialBlock = order.credentialText
    ? panel(
        `<p style="margin:0 0 10px;color:${BRAND.faint};font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;">Your account details</p>
         <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:${MONO};font-size:14px;line-height:1.7;color:${BRAND.ink};">${escapeHtml(order.credentialText)}</pre>`
      )
    : '';

  // A text-only delivery has no download link, so it would otherwise have no call to action
  // at all — fall back to the dashboard, which always holds the credentials.
  const downloadBlock = downloadUrl
    ? `${button(downloadUrl, 'Download credentials')}
       ${p('This download link expires shortly for your security — you can always request a fresh one from your dashboard.', `font-size:13px;text-align:center;`)}`
    : loginButton('View in your dashboard');

  const body = `
    ${p(`Your order ${strong(`${orderRef(order)}`)} is ready. Everything you need is below.`)}
    ${credentialBlock}
    ${downloadBlock}
    ${order.expiresAt ? p(`Your subscription is active until ${strong(formatDate(order.expiresAt))}.`) : ''}
    ${p('These details are always available in your Accvendor dashboard.', `font-size:13px;`)}
  `;
  return baseTemplate('Your order is ready', body, {
    preheader: `Order ${orderRef(order)} delivered — your account details are inside`,
    badge: pill('Delivered', 'good'),
  });
}

function cancelRequestRejectedEmail(order) {
  const body = `
    ${p(`We reviewed your cancellation request for order ${strong(`${orderRef(order)}`)} and weren't able to approve it — your subscription remains active.`)}
    ${
      order.cancelRejectionReason
        ? panel(
            `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(order.cancelRejectionReason)}</p>`
          )
        : ''
    }
    ${p('If you have questions, open a support ticket and we’ll take another look.')}
    ${button(`${SITE_URL}/dashboard/tickets/new`, 'Open a ticket')}
  `;
  return baseTemplate('Cancellation request declined', body, {
    preheader: `Update on your cancellation request for order ${orderRef(order)}`,
    badge: pill('Declined', 'bad'),
  });
}

function orderExpiredEmail(order) {
  const body = `
    ${p(`Your subscription from order ${strong(`${orderRef(order)}`)} has expired and access has now ended.`)}
    ${p('Renew any time to pick up right where you left off.')}
    ${button(`${SITE_URL}/products`, 'Renew now')}
  `;
  return baseTemplate('Subscription expired', body, {
    preheader: `Order ${orderRef(order)} has expired`,
    badge: pill('Expired', 'bad'),
  });
}

function expiryReminderEmail(order, daysLeft) {
  const body = `
    ${p(`Your subscription from order ${strong(`${orderRef(order)}`)} expires in ${strong(`${daysLeft} day${daysLeft === 1 ? '' : 's'}`)} — on ${formatDate(order.expiresAt)}.`)}
    ${p('Renew before then to avoid any interruption to your access.')}
    ${button(`${SITE_URL}/products`, 'Renew now')}
  `;
  return baseTemplate('Your subscription is expiring soon', body, {
    preheader: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left on order ${orderRef(order)}`,
    badge: pill(`${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, 'warn'),
  });
}

// --- Shared CTA ---------------------------------------------------------------------------
// "Login to Your Account" points at the plain dashboard route and carries no token or
// credential of any kind: if the browser already holds a valid session the app routes straight
// through, and if it doesn't the normal login screen appears. Putting a magic token in an
// email body URL would make the message itself a bearer credential, which it must never be.
function loginButton(label = 'Login to Your Account', path = '/dashboard') {
  return button(`${SITE_URL}${path}`, label);
}

function paymentReminderEmail(order) {
  const minutesLeft = order.paymentDueAt
    ? Math.max(0, Math.ceil((new Date(order.paymentDueAt).getTime() - Date.now()) / 60000))
    : null;

  const body = `
    ${p(`We haven't received payment for order ${strong(orderRef(order))} yet.`)}
    ${orderSummary(order)}
    ${panel(
      `<p style="margin:0 0 8px;color:${BRAND.ink};font-size:14px;line-height:1.6;">
        <strong>Amount due:</strong> ${formatPrice(order.total, order.currency)}<br />
        <strong>Payment status:</strong> Unpaid<br />
        <strong>Pay with:</strong> ${escapeHtml(order.paymentMethod.name)} &middot; ${escapeHtml(order.paymentMethod.accountNumber)}
        ${minutesLeft !== null ? `<br /><strong>Deadline:</strong> ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} from now` : ''}
      </p>`
    )}
    ${p('Once you have paid, upload your payment proof and we will verify it right away.')}
    ${button(`${SITE_URL}/dashboard`, 'Complete payment')}
  `;
  return baseTemplate('Payment reminder', body, {
    preheader: `${orderRef(order)} is still unpaid — ${formatPrice(order.total, order.currency)} due`,
    badge: pill('Unpaid', 'warn'),
  });
}

function unpaidOrderExpiredEmail(order) {
  const body = `
    ${p(`Order ${strong(orderRef(order))} expired because payment wasn't completed in time, so we've released the items back into stock.`)}
    ${orderSummary(order)}
    ${p('Nothing was charged. If you still want these items, you can place the order again in a couple of clicks.')}
    ${button(`${SITE_URL}/dashboard?reorder=${encodeURIComponent(orderRef(order))}`, 'Order again')}
  `;
  return baseTemplate('Order expired', body, {
    preheader: `${orderRef(order)} expired — payment was not completed`,
    badge: pill('Expired', 'bad'),
    footerNote: 'You were not charged for this order.',
  });
}

function orderCancelledEmail(order) {
  const body = `
    ${p(`Your cancellation request for order ${strong(orderRef(order))} has been approved and the order is now cancelled.`)}
    ${orderSummary(order)}
    ${p('If you were expecting a refund, our support team will follow up separately with the details.')}
    ${loginButton('View your orders')}
  `;
  return baseTemplate('Order cancelled', body, {
    preheader: `${orderRef(order)} has been cancelled`,
    badge: pill('Cancelled', 'bad'),
  });
}

function ticketAutoClosedEmail(ticket, hours) {
  const body = `
    ${p(`Your support ticket ${strong(escapeHtml(ticket.subject))} was closed automatically because we didn't hear back from you for ${hours} hours after our last reply.`)}
    ${p('This is routine housekeeping, not a dismissal — if the issue is still open, just reply on the ticket or start a new one and we will pick it straight back up.')}
    ${button(`${SITE_URL}/dashboard/tickets/${ticket._id}`, 'Reopen the conversation')}
  `;
  return baseTemplate('Support ticket closed', body, {
    preheader: `"${escapeHtml(ticket.subject)}" was closed after ${hours} hours of inactivity`,
    badge: pill('Closed', 'muted'),
    footerNote: 'Closed tickets stay in your dashboard — nothing has been deleted.',
  });
}

// Free-form admin -> customer message. Both the subject and the body are admin-authored, so
// both go through escapeHtml; newlines become <br /> so the message keeps the shape it was
// typed in without any markup being interpreted.
function adminMessageEmail({ subject, message, recipientName, orderNumber }) {
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br />');
  const body = `
    ${p(`Hi ${escapeHtml(recipientName || 'there')},`)}
    ${panel(
      `<p style="margin:0;color:${BRAND.ink};font-size:15px;line-height:1.7;">${safeMessage}</p>`
    )}
    ${orderNumber ? p(`This message relates to order ${strong(escapeHtml(orderNumber))}.`) : ''}
    ${loginButton()}
  `;
  return baseTemplate(escapeHtml(subject), body, {
    preheader: message.slice(0, 120),
    badge: pill('Message from support'),
  });
}

function newsletterWelcomeEmail() {
  const body = `
    ${p("You're subscribed. We'll send you new account drops, restocks and the occasional discount — nothing else.")}
    ${button(`${SITE_URL}/products`, 'Browse accounts')}
  `;
  return baseTemplate('Welcome to Accvendor', body, {
    preheader: "You're subscribed to Accvendor updates",
    footerNote: 'You can unsubscribe from any newsletter email.',
  });
}

module.exports = {
  baseTemplate,
  otpEmail,
  passwordResetEmail,
  orderCreatedEmail,
  proofSubmittedEmail,
  orderApprovedEmail,
  orderRejectedEmail,
  orderDeliveredEmail,
  orderExpiredEmail,
  expiryReminderEmail,
  cancelRequestRejectedEmail,
  paymentReminderEmail,
  unpaidOrderExpiredEmail,
  orderCancelledEmail,
  ticketAutoClosedEmail,
  adminMessageEmail,
  newsletterWelcomeEmail,
  loginButton,
};
