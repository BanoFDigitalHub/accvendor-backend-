const { env } = require('../config/env');

const BRAND = {
  name: 'accvendor.com',
  tagline: 'Accounts for every need',
  accent: '#036af7',
  ink: '#273344',
  muted: '#56606d',
  line: '#d9e2ec',
  wash: '#f2f9f9',
};

// The logo ships with the client, so emails point at the deployed site's copy.
const LOGO_URL = `${env.clientUrl.replace(/\/$/, '')}/logo.jpeg`;

function button(href, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="border-radius:10px;background:${BRAND.accent};">
    <a href="${href}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

function baseTemplate(title, bodyHtml, options = {}) {
  const { preheader = '', footerNote = '' } = options;
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:${BRAND.wash};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.wash};padding:32px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:28px 32px 8px;">
                <img src="${LOGO_URL}" width="132" alt="${BRAND.name}" style="display:block;width:132px;max-width:60%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0;color:${BRAND.ink};font-size:21px;line-height:1.3;font-weight:700;text-align:center;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;color:${BRAND.muted};font-size:15px;line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:${BRAND.wash};border-top:1px solid ${BRAND.line};color:#7f8ea3;font-size:12px;line-height:1.6;text-align:center;">
                ${footerNote ? `<p style="margin:0 0 8px;">${footerNote}</p>` : ''}
                <p style="margin:0;color:${BRAND.ink};font-weight:600;">${BRAND.name}</p>
                <p style="margin:2px 0 0;">${BRAND.tagline}</p>
                <p style="margin:10px 0 0;">&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
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
  const body = `
    <p style="margin:0 0 6px;">Enter this code to finish creating your account.</p>
    <p style="margin:20px 0;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;color:${BRAND.ink};background:${BRAND.wash};border:1px solid ${BRAND.line};padding:18px;border-radius:12px;">${otp}</p>
    <p style="margin:0;">The code expires in <strong style="color:${BRAND.ink};">${expiresMinutes} minutes</strong>.</p>
  `;
  return baseTemplate('Verify your email', body, {
    preheader: `Your verification code is ${otp}`,
    footerNote: "Didn't try to sign up? You can safely ignore this email.",
  });
}

function passwordResetEmail(link, expiresMinutes) {
  const body = `
    <p style="margin:0;">We received a request to reset your password. The link below works for the next <strong style="color:${BRAND.ink};">${expiresMinutes} minutes</strong>.</p>
    ${button(link, 'Reset my password')}
    <p style="margin:0;font-size:13px;">If the button doesn't work, paste this into your browser:<br /><a href="${link}" style="color:${BRAND.accent};word-break:break-all;">${link}</a></p>
  `;
  return baseTemplate('Reset your password', body, {
    preheader: 'Reset your Accvendor password',
    footerNote: "Didn't request this? Ignore this email — your password stays unchanged.",
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(value) {
  return `Rs ${Number(value).toLocaleString()}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function orderItemsList(items) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;">
      ${items
        .map(
          (i) => `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${i.name} &times; ${i.quantity}</td>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${formatPrice(i.unitPrice * i.quantity)}</td>
        </tr>`
        )
        .join('')}
    </table>
  `;
}

function orderCreatedEmail(order) {
  const body = `
    <p>Thanks for your order! Here's a summary:</p>
    ${orderItemsList(order.items)}
    <p style="font-size:18px;font-weight:bold;">Total: ${formatPrice(order.total)}</p>
    <p>Please complete payment via <strong>${order.paymentMethod.name}</strong> and upload your payment proof to move your order forward.</p>
  `;
  return baseTemplate('Order received', body);
}

function proofSubmittedEmail(order) {
  const body = `
    <p>We've received your payment proof for order <strong>#${String(order._id).slice(-8)}</strong>. Our team is reviewing it now.</p>
    <p>We'll email you as soon as it's approved.</p>
  `;
  return baseTemplate('Payment proof received', body);
}

function orderApprovedEmail(order) {
  const body = `
    <p>Good news — your payment for order <strong>#${String(order._id).slice(-8)}</strong> has been approved.</p>
    <p>We're preparing your account details and will send them shortly.</p>
  `;
  return baseTemplate('Payment approved', body);
}

function orderRejectedEmail(order) {
  const body = `
    <p>Unfortunately we couldn't verify the payment proof for order <strong>#${String(order._id).slice(-8)}</strong>.</p>
    ${order.rejectionReason ? `<p><strong>Reason:</strong> ${order.rejectionReason}</p>` : ''}
    <p>Please contact support or place a new order if you'd like to try again.</p>
  `;
  return baseTemplate('Payment could not be verified', body);
}

function orderDeliveredEmail(order, downloadUrl) {
  const credentialBlock = order.credentialText
    ? `
    <p style="font-weight:bold;">Your account details:</p>
    <pre style="white-space:pre-wrap;word-break:break-word;background:#f3f4f6;border-radius:6px;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">${escapeHtml(order.credentialText)}</pre>
  `
    : '';
  const downloadBlock = downloadUrl
    ? `
    <p style="text-align:center;">
      <a href="${downloadUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;">Download Credentials</a>
    </p>
    <p style="color:#6b7280;font-size:13px;">This link expires shortly for your security — you can always request a fresh one from your dashboard.</p>
  `
    : '';
  const body = `
    <p>Your order <strong>#${String(order._id).slice(-8)}</strong> is ready!</p>
    ${credentialBlock}
    ${downloadBlock}
    ${order.expiresAt ? `<p>Your subscription is active until <strong>${formatDate(order.expiresAt)}</strong>.</p>` : ''}
    <p style="color:#6b7280;font-size:13px;">You can always find these details again in your Accvendor dashboard.</p>
  `;
  return baseTemplate('Your order is ready', body);
}

function cancelRequestRejectedEmail(order) {
  const body = `
    <p>We reviewed your cancellation request for order <strong>#${String(order._id).slice(-8)}</strong> and were unable to approve it — your subscription remains active.</p>
    ${order.cancelRejectionReason ? `<p><strong>Reason:</strong> ${order.cancelRejectionReason}</p>` : ''}
    <p>If you have questions, please open a support ticket from your dashboard.</p>
  `;
  return baseTemplate('Cancellation request declined', body);
}

function orderExpiredEmail(order) {
  const body = `
    <p>Your subscription from order <strong>#${String(order._id).slice(-8)}</strong> has expired.</p>
    <p>Visit Accvendor to renew and keep your access active.</p>
  `;
  return baseTemplate('Subscription expired', body);
}

function expiryReminderEmail(order, daysLeft) {
  const body = `
    <p>Your subscription from order <strong>#${String(order._id).slice(-8)}</strong> expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> (${formatDate(order.expiresAt)}).</p>
    <p>Renew now to avoid losing access.</p>
  `;
  return baseTemplate('Your subscription is expiring soon', body);
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
};
