function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:20px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:bold;">Accvendor</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
                <h2 style="margin-top:0;color:#111827;">${title}</h2>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;">
                &copy; ${new Date().getFullYear()} Accvendor. All rights reserved.
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
    <p>Use the code below to verify your email address. This code expires in <strong>${expiresMinutes} minutes</strong>.</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f3f4f6;padding:16px;border-radius:6px;">${otp}</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;
  return baseTemplate('Verify your email', body);
}

function passwordResetEmail(link, expiresMinutes) {
  const body = `
    <p>We received a request to reset your password. This link expires in <strong>${expiresMinutes} minutes</strong>.</p>
    <p style="text-align:center;">
      <a href="${link}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;">Reset Password</a>
    </p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;
  return baseTemplate('Reset your password', body);
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
  const body = `
    <p>Your order <strong>#${String(order._id).slice(-8)}</strong> is ready! Your account credentials are available for download below.</p>
    <p style="text-align:center;">
      <a href="${downloadUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;">Download Credentials</a>
    </p>
    <p style="color:#6b7280;font-size:13px;">This link expires shortly for your security — you can always request a fresh one from your dashboard.</p>
    ${order.expiresAt ? `<p>Your subscription is active until <strong>${formatDate(order.expiresAt)}</strong>.</p>` : ''}
  `;
  return baseTemplate('Your order is ready', body);
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
};
