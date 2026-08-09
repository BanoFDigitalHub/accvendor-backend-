const crypto = require('crypto');

// Crockford-style alphabet: no 0/O, 1/I/L, or U. A customer reading an order number off a
// receipt (or dictating it to support) can't turn one character into another.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'AV';
const BODY_LENGTH = 6;
const MAX_ATTEMPTS = 8;

/**
 * Generates a candidate order number like `AV-7K4P2M`.
 *
 * Uses rejection sampling over crypto random bytes so every character is uniformly distributed —
 * a plain `byte % 30` would bias the first two letters of the alphabet.
 */
function generateOrderNumber() {
  let body = '';
  while (body.length < BODY_LENGTH) {
    for (const byte of crypto.randomBytes(BODY_LENGTH * 2)) {
      if (byte >= 256 - (256 % ALPHABET.length)) continue; // reject, would skew the distribution
      body += ALPHABET[byte % ALPHABET.length];
      if (body.length === BODY_LENGTH) break;
    }
  }
  return `${PREFIX}-${body}`;
}

/**
 * Runs `save(orderNumber)` with freshly generated numbers until one is not a duplicate.
 *
 * The unique index on Order.orderNumber is the real guarantee — this just retries the losing
 * side of a race instead of surfacing a 500. 30^6 ≈ 729M values makes a collision rare enough
 * that the first attempt essentially always wins.
 */
async function withUniqueOrderNumber(save) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await save(generateOrderNumber());
    } catch (err) {
      const isDuplicateOrderNumber =
        err?.code === 11000 && JSON.stringify(err.keyPattern || err.keyValue || {}).includes('orderNumber');
      if (!isDuplicateOrderNumber) throw err;
    }
  }
  throw new Error('Could not allocate a unique order number after several attempts');
}

module.exports = { generateOrderNumber, withUniqueOrderNumber, ALPHABET, PREFIX };
