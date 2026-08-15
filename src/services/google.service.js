const { OAuth2Client } = require('google-auth-library');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');

/**
 * Google Sign-In — verification of the ID token the browser hands us.
 *
 * The flow is Google Identity Services' **ID-token** flow, not the older redirect/authorization-
 * code dance:
 *
 *   1. The browser loads Google's script, which renders the button and does the whole consent
 *      exchange inside Google's own origin.
 *   2. Google hands the page a signed JWT (the "credential") describing who just consented.
 *   3. The page POSTs that JWT here, and **this file is the only thing that decides whether it
 *      is real**. It is verified against Google's published signing keys, and its `aud` claim is
 *      checked against our own client id.
 *
 * That last check is the whole security of the scheme. A signed Google ID token is trivially
 * obtainable — any site with a Google button holds thousands of them — so a token that is
 * genuinely signed by Google but was *issued to someone else's app* must be refused, or anyone
 * could replay a token from their own site and sign in as that user here. `verifyIdToken` with
 * an explicit `audience` is what enforces it; never swap it for a bare `decode()`.
 *
 * We also require `email_verified`. Google will issue tokens for unverified addresses on some
 * Workspace configurations, and accepting one would let somebody claim an email they do not own
 * — which, because accounts are keyed on email, is account takeover of an existing local user.
 */

const isConfigured = () => Boolean(env.google.clientId);

// One client, reused: it caches Google's signing certificates, so a per-request client would
// re-fetch them on every sign-in.
let client = null;
function getClient() {
  if (!client) client = new OAuth2Client(env.google.clientId);
  return client;
}

/**
 * Verifies a Google ID token and returns the identity inside it.
 *
 * Throws an `ApiError` for anything the caller should surface — misconfiguration, an invalid or
 * expired token, an unverified address — so the auth service never has to interpret a raw
 * google-auth-library error.
 */
async function verifyIdToken(credential) {
  if (!isConfigured()) {
    throw new ApiError(
      501,
      'Google Sign-In is not configured on this server. Set GOOGLE_CLIENT_ID in server/.env.'
    );
  }

  let payload;
  try {
    const ticket = await getClient().verifyIdToken({
      idToken: credential,
      audience: env.google.clientId,
    });
    payload = ticket.getPayload();
  } catch {
    // Expired, tampered with, or issued to a different client id. All of them are the same thing
    // to the person in front of the browser: try again.
    throw new ApiError(401, 'Google sign-in could not be verified. Please try again.');
  }

  if (!payload?.sub || !payload.email) {
    throw new ApiError(401, 'Google did not return an email address for this account.');
  }

  // `email_verified` arrives as a boolean, but has historically been serialised as a string by
  // some Google endpoints — compare loosely rather than trusting the type.
  if (payload.email_verified !== true && String(payload.email_verified) !== 'true') {
    throw new ApiError(
      403,
      'That Google account has an unverified email address. Verify it with Google first, or sign up with your email.'
    );
  }

  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase().trim(),
    name: payload.name || payload.given_name || String(payload.email).split('@')[0],
    avatarUrl: payload.picture || null,
  };
}

module.exports = { verifyIdToken, isConfigured };
