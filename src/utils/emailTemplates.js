const { env } = require('../config/env');
const { formatMoney } = require('./money');

/**
 * White paper, blue ink for the things you press.
 *
 * The template used to be a rounded card on a tinted page with a navy masthead, a tinted "need a
 * hand" panel and a tinted footer — four different grounds in one message. Every one of them is
 * a surface a mail client can render slightly differently, and together they made a receipt look
 * like a marketing layout. It is now white throughout, and the **only** colour is the brand blue,
 * used for exactly two things: the button, and the hairlines that separate one part from the
 * next. Everything else is type — size and weight do the work that colour was doing.
 *
 * No greens, ambers or reds. A status is stated in the title and in words; a coloured chip saying
 * the same thing is decoration, and it is the first thing that makes a transactional email look
 * like a template rather than a letter.
 */
const BRAND = {
  name: 'accvendor.com',
  tagline: 'Accounts for every need',
  accent: '#036af7',
  accentDark: '#0355c4',
  ink: '#132741',
  muted: '#5a6b80',
  faint: '#8496ab',
  line: '#e6ebf1',
};

// The storefront, never the admin origin — every button below is pressed by a customer.
const SITE_URL = env.siteUrl.replace(/\/$/, '');
/**
 * The logo is referenced by **content id, not by URL**.
 *
 * A `cid:` reference points at a part of the message itself, so there is nothing for the mail
 * client to fetch and nothing for it to block. That is the whole reason: the remote URL was
 * reachable and the markup was right, but Gmail, Outlook and Apple Mail all refuse to load
 * remote images for a sender the recipient has never replied to — which is every transactional
 * email a new customer receives — and what they saw in the header was a placeholder icon.
 *
 * `email.service.js` owns the asset and attaches it; if it cannot read the file it rewrites this
 * reference to `env.emailLogoUrl` on the way out, so a missing asset degrades to the linked
 * image rather than to a dead `cid:`.
 */
const LOGO_CID = 'accvendor-logo';
const LOGO_SRC = `cid:${LOGO_CID}`;

// Email clients strip <style> unpredictably, so every rule is inline. Kept as short helpers
// rather than repeated literals so a brand tweak is a one-line change.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function escapeHtml(str) {
  // Nullish renders as nothing, not as the word "undefined". Every interpolated value in this
  // file goes through here, and `String(undefined)` puts a literal "undefined" in a customer's
  // inbox for any field that turns out to be optional — the kind of thing nobody notices until
  // it has been sent a few hundred times.
  if (str === null || str === undefined) return '';
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

// Deep link to the one order the email is about. `/dashboard` alone drops the customer on a
// list and makes them find it again — with several orders open that is a real hunt, and the
// dashboard route already accepts an order number.
function orderUrl(order) {
  return order?.orderNumber ? `${SITE_URL}/dashboard/orders/${encodeURIComponent(order.orderNumber)}` : `${SITE_URL}/dashboard`;
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

/**
 * The small label above the title.
 *
 * One treatment, whatever it says: uppercase, letterspaced, on white inside a hairline. The
 * `tone` argument is still accepted so the fifteen call sites do not all have to change, and is
 * deliberately ignored — a green "Delivered" and a red "Not verified" were the only two things
 * in the message that were not blue, and the title beneath already says which one it is.
 */
function pill(label) {
  return `<span style="display:inline-block;padding:5px 12px;background:#ffffff;border:1px solid ${BRAND.line};color:${BRAND.faint};font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;border-radius:999px;">${label}</span>`;
}

// A bordered panel for the things the reader actually came for — the code, the credentials,
// the order summary — so they survive a skim.
function panel(innerHtml, extra = '') {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr><td style="padding:18px 20px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:10px;${extra}">${innerHtml}</td></tr>
  </table>`;
}

/**
 * Drops the explanatory comments from the markup on the way out — but never the Outlook ones.
 *
 * This file is heavily commented *inside* the HTML, because the reasons behind bulletproof
 * buttons and blocked-image fallbacks are exactly what a future reader needs. Those comments were
 * being posted to customers: about 2KB, 17% of every message, of notes addressed to whoever next
 * opens this file. Gmail clips a message over 102KB, so it was never a correctness problem, but
 * it is bytes in someone's mailbox that say nothing to them.
 *
 * The MSO conditionals are load-bearing markup, not prose — `<!--[if mso]>` is what gives Outlook
 * a real button, and `<!--[if !mso]><!-- -->` is what hides that from everyone else. A comment is
 * kept if it mentions a conditional at all, which covers the opening block, the downlevel-revealed
 * pair and the bare `<!--<![endif]-->`.
 */
function stripAuthorComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (match) => (/\[if\b|\[endif\]|<!\[/i.test(match) ? match : ''));
}

function baseTemplate(title, bodyHtml, options = {}) {
  const {
    preheader = '',
    footerNote = '',
    badge = '',
    // One line under the title saying what this email is about, so the reader knows within a
    // second whether it needs them.
    //
    // **It is the only place that line is allowed to appear.** Every template used to state its
    // purpose here and then restate it as the opening paragraph of the body — the reader met the
    // same sentence twice before reaching the code, the summary or the button they came for, and
    // a message that repeats itself reads as generated. The context says what happened; the body
    // starts at the thing itself.
    context = '',
    // Why this landed in their inbox. Every email says it, because "why am I getting this?" is
    // the question that turns a transactional email into a spam report.
    reason = 'You are receiving this email because you have an account on accvendor.com.',
  } = options;
  return stripAuthorComments(`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
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
  <body style="margin:0;padding:0;width:100%;background:#ffffff;font-family:${FONT};-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <!-- Trailing entities stop Gmail pulling body copy into the inbox preview after the preheader. -->
    <div style="display:none;max-height:0;overflow:hidden;">${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:28px 16px 40px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;">

            <!-- Accent rule across the top. Two pixels of brand that render in every client,
                 with no image and no font, so the email is recognisably ours before anything
                 else has loaded. -->
            <tr><td style="height:3px;background:${BRAND.accent};font-size:0;line-height:0;">&nbsp;</td></tr>

            <!-- Brand mark, then wordmark.
                 Gmail and Outlook block remote images by default for a sender the recipient has
                 never replied to. The logo previously carried alt="accvendor.com" *inside* an
                 anchor, so a blocked image rendered as a blue underlined "accvendor.com" —
                 a stray link sitting where the logo should be, which is exactly how it looked
                 in a real inbox. The image is now decorative (alt=""), so blocking it leaves
                 nothing behind, and the wordmark beside it is live text: no image to block,
                 no font to miss, correct in every client.

                 **The tile is white, and the artwork is inset in it.** It used to be the accent
                 blue with the logo stretched to the full 46px. logo.png is a transparent mark
                 drawn in navy *and* the same accent blue, so on an accent tile half of it
                 vanished into the background and the rest lost its edges — which is what read
                 as a blurry logo. White is the ground the mark was drawn for. The inset (36px
                 of art in a 46px tile) stops the shape touching the rounded corners, and the
                 source is 512px so it is still ~14x the rendered density on any display. -->
            <tr>
              <td align="center" style="padding:30px 32px 24px;background:#ffffff;">
                <img src="${LOGO_SRC}" width="52" height="52" alt=""
                  style="display:block;margin:0 auto;width:52px;height:52px;border:0;" />
                <div style="margin:12px 0 0;color:${BRAND.ink};font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.2px;line-height:1.3;">${BRAND.name}</div>
              </td>
            </tr>

            <tr><td style="padding:0 32px;"><div style="height:1px;background:${BRAND.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>

            <tr>
              <td style="padding:30px 32px 0;" align="center">
                ${badge ? `<div style="margin:0 0 14px;">${badge}</div>` : ''}
                <h1 style="margin:0;color:${BRAND.ink};font-size:23px;line-height:1.35;font-weight:700;letter-spacing:-0.3px;">${title}</h1>
                ${
                  context
                    ? `<p style="margin:10px 0 0;color:${BRAND.faint};font-size:14px;line-height:1.55;">${context}</p>`
                    : ''
                }
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 30px;color:${BRAND.muted};font-size:15px;line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- A real way to reach a person, one row above the legal small print. Every
                 support email we send is answered by the same team this points at. -->
            <tr>
              <td style="padding:0 32px 24px;">
                <div style="height:1px;background:${BRAND.line};font-size:0;line-height:0;">&nbsp;</div>
                <p style="margin:20px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.7;">
                  Need a hand? Our team answers every ticket —
                  <a href="${SITE_URL}/dashboard/tickets/new" style="color:${BRAND.accentDark};font-weight:600;text-decoration:underline;">open one here</a>
                  and we'll pick it up.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 8px;background:#ffffff;border-top:1px solid ${BRAND.line};text-align:center;">
                ${footerNote ? `<p style="margin:0 0 14px;color:${BRAND.faint};font-size:13px;line-height:1.6;">${footerNote}</p>` : ''}

                <!-- Every email carries the same way back to the site: a recipient who wants to
                     act on it should never have to search for the URL, or trust a link they
                     were sent by someone else. -->
                <p style="margin:0 0 14px;font-size:13px;line-height:1.9;">
                  <a href="${SITE_URL}" style="color:${BRAND.accentDark};font-weight:600;text-decoration:none;">Website</a>
                  <span style="color:${BRAND.line};">&nbsp;|&nbsp;</span>
                  <a href="${SITE_URL}/dashboard" style="color:${BRAND.accentDark};font-weight:600;text-decoration:none;">My orders</a>
                  <span style="color:${BRAND.line};">&nbsp;|&nbsp;</span>
                  <a href="${SITE_URL}/dashboard/tickets/new" style="color:${BRAND.accentDark};font-weight:600;text-decoration:none;">Support</a>
                  <span style="color:${BRAND.line};">&nbsp;|&nbsp;</span>
                  <a href="${SITE_URL}/terms" style="color:${BRAND.accentDark};font-weight:600;text-decoration:none;">Terms</a>
                </p>

                <p style="margin:0;color:${BRAND.ink};font-size:13px;font-weight:700;">${BRAND.name}</p>
                <p style="margin:3px 0 0;color:${BRAND.faint};font-size:12px;">${BRAND.tagline}</p>
                <p style="margin:12px 0 0;color:${BRAND.faint};font-size:11px;line-height:1.6;">${reason}</p>
                <p style="margin:8px 0 0;color:${BRAND.faint};font-size:11px;line-height:1.6;">
                  &copy; ${env.copyrightYear} ${BRAND.name} &middot; This is an automated message, please don't reply.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`);
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
    context: 'Enter this code on the sign-up screen to finish creating your account.',
    reason: 'You are receiving this because this email address was used to sign up on accvendor.com.',
    footerNote: "Didn't try to sign up? You can safely ignore this email — no account was created.",
  });
}

function passwordResetEmail(link, expiresMinutes) {
  const body = `
    ${button(link, 'Reset my password')}
    ${p(`The link works once, and expires in ${strong(`${expiresMinutes} minutes`)}.`, `text-align:center;font-size:13px;`)}
    ${p(
      `If the button doesn't work, paste this link into your browser:<br /><a href="${link}" style="color:${BRAND.accent};word-break:break-all;">${link}</a>`,
      `font-size:13px;`
    )}
  `;
  return baseTemplate('Reset your password', body, {
    preheader: 'Reset your Accvendor password',
    badge: pill('Security', 'warn'),
    context: 'Someone asked to reset the password on this account. If it was you, set a new one below.',
    reason: 'You are receiving this because a password reset was requested for this email address.',
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
    ${orderSummary(order)}
    ${panel(
      `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;">
        <strong>Next step:</strong> complete your payment via ${strong(escapeHtml(order.paymentMethod.name))},
        then upload your payment proof so we can verify it and release your account.
      </p>`
    )}
    ${button(orderUrl(order), 'Upload payment proof')}
  `;
  return baseTemplate('Order received', body, {
    preheader: `Order ${orderRef(order)} — ${formatPrice(order.total, order.currency)}. Payment proof needed.`,
    badge: pill('Awaiting payment', 'warn'),
    context: `We are holding order ${orderRef(order)} for you. Pay, then upload the receipt so we can release it.`,
    reason: `You are receiving this because you placed order ${orderRef(order)} on accvendor.com.`,
  });
}

function proofSubmittedEmail(order) {
  const body = `
    ${p(`Most payments are checked within a few hours. We will email you the moment order ${strong(`${orderRef(order)}`)} is approved — there is nothing for you to do until then.`)}
    ${loginButton('View your order')}
  `;
  return baseTemplate('Payment proof received', body, {
    preheader: `We're reviewing your payment for order ${orderRef(order)}`,
    badge: pill('Under review', 'warn'),
    context: 'We have your receipt and are checking it against our account.',
    reason: `You are receiving this because you uploaded payment proof for order ${orderRef(order)}.`,
  });
}

function orderApprovedEmail(order) {
  const body = `
    ${p(`We are preparing the account details for order ${strong(`${orderRef(order)}`)} now, and will email them as soon as they are ready.`)}
    ${loginButton('View your order')}
  `;
  return baseTemplate('Payment approved', body, {
    preheader: `Payment approved for order ${orderRef(order)}`,
    badge: pill('Approved', 'good'),
    context: 'Your payment checked out. Your order is being prepared.',
    reason: `You are receiving this because of an update to your order ${orderRef(order)}.`,
  });
}

function orderRejectedEmail(order) {
  const body = `
    ${p(`We could not match the receipt on order ${strong(`${orderRef(order)}`)} to a payment we received. Nothing has been taken from you.`)}
    ${
      order.rejectionReason
        ? panel(
            `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(order.rejectionReason)}</p>`
          )
        : ''
    }
    ${p('If you think this is wrong, send us the receipt on a ticket and we will look again.')}
    ${button(`${SITE_URL}/dashboard/tickets/new`, 'Contact support')}
  `;
  return baseTemplate('Payment could not be verified', body, {
    preheader: `Action needed on order ${orderRef(order)}`,
    badge: pill('Not verified', 'bad'),
    context: 'We could not find your payment. Nothing has been charged.',
    reason: `You are receiving this because of an update to your order ${orderRef(order)}.`,
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
    ${credentialBlock}
    ${downloadBlock}
    ${order.expiresAt ? p(`Your subscription is active until ${strong(formatDate(order.expiresAt))}.`) : ''}
    ${p('A copy stays in your dashboard, so you will not lose these.', `font-size:13px;`)}
  `;
  return baseTemplate('Your order is ready', body, {
    preheader: `Order ${orderRef(order)} delivered — your account details are inside`,
    badge: pill('Delivered', 'good'),
    context: 'Your account details are below, and stay in your dashboard.',
    reason: `You are receiving this because your order ${orderRef(order)} has been delivered.`,
  });
}

function cancelRequestRejectedEmail(order) {
  // The reason moved into the cancelRequest sub-document; the flat name is still accepted so a
  // pre-migration order (or an already-serialized one) renders the same.
  const rejectionReason = order.cancelRequest?.rejectionReason || order.cancelRejectionReason;
  const body = `
    ${p(`Order ${strong(`${orderRef(order)}`)} stays active.`)}
    ${
      rejectionReason
        ? panel(
            `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>`
          )
        : ''
    }
    ${p('If that does not sound right, open a ticket and we will take another look.')}
    ${button(`${SITE_URL}/dashboard/tickets/new`, 'Open a ticket')}
  `;
  return baseTemplate('Cancellation request declined', body, {
    preheader: `Update on your cancellation request for order ${orderRef(order)}`,
    badge: pill('Declined', 'bad'),
    context: 'We looked at your cancellation request and could not approve it.',
    reason: `You are receiving this because you requested a cancellation for order ${orderRef(order)}.`,
  });
}

function orderExpiredEmail(order) {
  const body = `
    ${p(`Access from order ${strong(`${orderRef(order)}`)} has ended. Ordering it again takes a minute.`)}
    ${button(`${SITE_URL}/products`, 'Order again')}
  `;
  return baseTemplate('Subscription expired', body, {
    preheader: `Order ${orderRef(order)} has expired`,
    badge: pill('Expired', 'bad'),
    context: 'This subscription has reached the end of its term.',
    reason: `You are receiving this because your order ${orderRef(order)} has reached the end of its validity.`,
  });
}

function expiryReminderEmail(order, daysLeft) {
  const body = `
    ${p(`Order ${strong(`${orderRef(order)}`)} runs out on ${strong(formatDate(order.expiresAt))}. Renew before then and your access carries straight on.`)}
    ${button(`${SITE_URL}/products`, 'Renew now')}
  `;
  return baseTemplate('Your subscription is expiring soon', body, {
    preheader: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left on order ${orderRef(order)}`,
    badge: pill(`${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, 'warn'),
    context: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left on this subscription.`,
    reason: `You are receiving this because your order ${orderRef(order)} is close to expiring.`,
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
    ${button(orderUrl(order), 'Complete payment')}
  `;
  return baseTemplate('Payment reminder', body, {
    preheader: `${orderRef(order)} is still unpaid — ${formatPrice(order.total, order.currency)} due`,
    badge: pill('Unpaid', 'warn'),
    context: 'Your items are still held for you, but not indefinitely - complete the payment to keep them.',
    reason: `You are receiving this because order ${orderRef(order)} is still awaiting payment.`,
  });
}

function unpaidOrderExpiredEmail(order) {
  const body = `
    ${p(`Order ${strong(orderRef(order))} was cancelled because payment wasn't completed in time, so we've released the items back into stock.`)}
    ${orderSummary(order)}
    ${p('Nothing was charged. If you still want these items, you can place the order again in a couple of clicks.')}
    ${button(`${SITE_URL}/dashboard?reorder=${encodeURIComponent(orderRef(order))}`, 'Order again')}
  `;
  return baseTemplate('Order cancelled', body, {
    preheader: `${orderRef(order)} cancelled — payment was not completed`,
    badge: pill('Cancelled', 'bad'),
    context: 'The payment window closed before we received a payment, so the items were released.',
    reason: `You are receiving this because order ${orderRef(order)} was cancelled.`,
    footerNote: 'You were not charged for this order.',
  });
}

function orderCancelledEmail(order) {
  const body = `
    ${orderSummary(order)}
    ${p('If a refund is due, support will follow up with the details separately — you do not need to chase it.')}
    ${loginButton('View your orders')}
  `;
  // The only email in this file that had no `context` and no `reason`, so it arrived without
  // the one line saying what happened and without the line saying why it reached them.
  return baseTemplate('Order cancelled', body, {
    preheader: `${orderRef(order)} has been cancelled`,
    badge: pill('Cancelled', 'bad'),
    context: `We approved your cancellation request. Order ${orderRef(order)} is now cancelled.`,
    reason: `You are receiving this because you requested a cancellation for order ${orderRef(order)}.`,
  });
}

/**
 * Account blocked / unblocked.
 *
 * Blocking revokes the account's tokens instantly (`tokenVersion`), so the person is signed
 * out mid-session with no explanation anywhere — the storefront simply stops letting them in.
 * Without this email the first they know of it is a login that refuses them, and the appeal
 * route is something they have to discover. Both messages therefore say plainly what happened,
 * why where a reason was recorded, and what to do next.
 *
 * The reason is admin-entered free text, so it goes through `escapeHtml` like every other
 * interpolated value here.
 */
function accountBlockedEmail(user) {
  const body = `
    ${
      user.blockReason
        ? panel(
            `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.6;"><strong>Reason:</strong> ${escapeHtml(user.blockReason)}</p>`
          )
        : p('No specific reason was recorded. Ask us and we will explain.')
    }
    ${p('Nothing has been deleted. Your order history and any credentials already delivered to you are untouched, and come back with the account if the block is lifted.')}
    ${p('If you think this is a mistake, go to the site and try to sign in: the screen that refuses you carries a form that sends your appeal straight to us.')}
    ${button(SITE_URL, 'Appeal this decision')}
  `;
  return baseTemplate('Your account has been blocked', body, {
    preheader: 'Your accvendor.com account has been blocked',
    badge: pill('Blocked', 'bad'),
    context: 'You have been signed out and cannot place orders until this is lifted.',
    reason: 'You are receiving this because it concerns the account registered to this email address.',
  });
}

function accountUnblockedEmail() {
  const body = `
    ${p('Everything is where you left it — your orders, your credentials and your support threads were never removed.')}
    ${loginButton('Sign in')}
  `;
  return baseTemplate('Your account has been restored', body, {
    preheader: 'Your accvendor.com account has been unblocked',
    badge: pill('Restored', 'good'),
    context: 'The block on your account has been lifted. You can sign in again.',
    reason: 'You are receiving this because it concerns the account registered to this email address.',
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
    context: 'No reply was needed, so we closed the thread. Reopening it takes one message.',
    reason: 'You are receiving this because you opened a support ticket on accvendor.com.',
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
    context: orderNumber ? `About your order ${escapeHtml(String(orderNumber))}.` : 'A message from the Accvendor support team.',
    reason: 'You are receiving this because our support team replied to you directly.',
  });
}

function newsletterWelcomeEmail() {
  const body = `
    ${p("You're subscribed. We'll send you new account drops, restocks and the occasional discount — nothing else.")}
    ${button(`${SITE_URL}/products`, 'Browse accounts')}
  `;
  return baseTemplate('Welcome to Accvendor', body, {
    preheader: "You're subscribed to Accvendor updates",
    context: 'You will hear from us when there are new products, restocks and offers - nothing else.',
    reason: 'You are receiving this because this address was subscribed to the Accvendor newsletter.',
    footerNote: 'You can unsubscribe from any newsletter email.',
  });
}

/**
 * Admin-facing: someone asked to be told when selling opens.
 *
 * Every value here was typed by a stranger on a public form, so all of it goes through
 * escapeHtml — this is the one template whose entire body is untrusted input.
 */
function leadEmail({
  program = "Seller",
  name,
  email,
  phone = "",
  details,
  platformUrl = "",
  isRepeat = false,
  submissions = 1,
}) {
  const body = `
    ${p(`${strong(escapeHtml(name))} wants to be notified when the ${escapeHtml(program).toLowerCase()} programme opens.`)}
    ${panel(
      `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.8;">
        <strong>Name:</strong> ${escapeHtml(name)}<br />
        <strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color:${BRAND.accentDark};text-decoration:none;">${escapeHtml(email)}</a>
        ${phone ? `<br /><strong>Phone:</strong> ${escapeHtml(phone)}` : ''}
        ${platformUrl ? `<br /><strong>Already selling on:</strong> ${escapeHtml(platformUrl)}` : ''}
        ${isRepeat ? `<br /><strong>Submissions:</strong> ${submissions} (they have asked before)` : ''}
      </p>`
    )}
    ${details ? panel(`<p style="margin:0 0 6px;color:${BRAND.faint};font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">What they want to sell</p><p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.7;white-space:pre-line;">${escapeHtml(details)}</p>`) : p('They did not add any details.')}
    ${p('Reply straight to them at the address above when you are ready to open their account.')}
  `;
  return baseTemplate(`New ${program.toLowerCase()} waitlist signup`, body, {
    preheader: `${escapeHtml(name)} — ${escapeHtml(email)}${phone ? ` — ${escapeHtml(phone)}` : ''}`,
    badge: pill(`${program} waitlist`),
    context: 'Someone filled in the "notify me" form on the site. The full list is under Leads in the admin panel.',
    reason: 'You are receiving this because you are an administrator on accvendor.com.',
  });
}

/** Visitor-facing: confirms they are on the list, and sets the expectation honestly. */
function leadConfirmationEmail({ program = "Seller", name }) {
  const body = `
    ${p(`Thanks${name ? `, ${escapeHtml(String(name).split(' ')[0])}` : ''} — you are on the list.`)}
    ${p(`The Accvendor ${escapeHtml(program).toLowerCase()} programme is not open yet. When it is, you will be one of the first to hear, and we will send you everything you need to get started.`)}
    ${panel(
      `<p style="margin:0;color:${BRAND.ink};font-size:14px;line-height:1.7;">
        <strong>What happens next</strong><br />
        We work through the waitlist in batches. There is nothing else for you to do — we will email this address.
      </p>`
    )}
    ${p('In the meantime you can keep buying as normal.')}
    ${button(`${SITE_URL}/products`, 'Browse the catalog')}
  `;
  return baseTemplate(`You are on the ${program.toLowerCase()} waitlist`, body, {
    preheader: `We will email you the moment the ${program.toLowerCase()} programme opens on Accvendor`,
    badge: pill('Waitlist', 'good'),
    context: 'We will email you as soon as it opens.',
    reason: `You are receiving this because you asked to be notified when the ${program.toLowerCase()} programme opens on accvendor.com.`,
  });
}

module.exports = {
  // Shared with email.service.js, which attaches the file this id points at.
  LOGO_CID,
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
  accountBlockedEmail,
  accountUnblockedEmail,
  ticketAutoClosedEmail,
  adminMessageEmail,
  leadEmail,
  leadConfirmationEmail,
  newsletterWelcomeEmail,
  loginButton,
};
