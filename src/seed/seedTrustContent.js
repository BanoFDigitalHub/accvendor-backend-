require('dotenv').config({ quiet: true });
const { connectDB, disconnectDB } = require('../config/db');
const Settings = require('../models/Settings');

/**
 * Seeds the storefront trust sections with starter content.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE LAUNCH.
 *
 * Everything below is **placeholder copy**, including the Google and Trustpilot figures and
 * every named reviewer. None of it describes real customers or real third-party scores. It
 * exists so the sections can be designed and demoed against realistic content, and so the
 * operator can see exactly which fields to fill.
 *
 * A star rating attributed to Google or Trustpilot is a factual claim about a third party, and
 * a testimonial with a name attached is a claim about a person. Publishing either while it is
 * still invented is a consumer-protection problem in most markets, not just a bad look —
 * replace all of it in Admin → Settings with figures you can point at.
 *
 * Every seeded row carries `isSeed: true` precisely so it can be found and cleared in one query:
 *   db.settings.updateOne({singleton:'main'}, {$pull: {'trust.testimonials': {isSeed: true}}})
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Run with: npm run seed:trust
 */

// Placeholder. Replace with the real figures from your own Google Business and Trustpilot
// profiles, and point `url` at those profiles.
const RATING_PROVIDERS = [
  {
    provider: 'Google',
    rating: 4.9,
    reviewCount: 127,
    url: '',
    accent: '#f5b301', // Google renders amber stars
    isActive: true,
  },
  {
    provider: 'Trustpilot',
    rating: 4.8,
    reviewCount: 89,
    url: '',
    accent: '#00b67a', // Trustpilot renders green
    isActive: true,
  },
];

const BADGES = [
  { label: 'Buyer Protection', sublabel: 'Every order covered', isActive: true },
  { label: 'Instant Delivery', sublabel: '95% under 5 minutes', isActive: true },
  { label: '24/7 Support', sublabel: 'Real people, any hour', isActive: true },
  { label: 'Secure Checkout', sublabel: 'Encrypted end to end', isActive: true },
];

const STATS = [
  { value: '10K+', label: 'Orders delivered', isActive: true },
  { value: '50+', label: 'Products available', isActive: true },
  { value: '95%', label: 'Delivered in 5 minutes', isActive: true },
  { value: '24/7', label: 'Support coverage', isActive: true },
];

/**
 * Six placeholder reviews, written about *this* business — subscriptions, delivery speed,
 * warranty, currency handling, support — rather than generic praise. `source` decides which
 * branding and star colour the card renders, so the mix here is deliberate: four Google, two
 * Trustpilot, matching the review counts above.
 *
 * The names and cities are European because that is who the storefront is priced and staffed
 * for — USD/EUR pricing, support hours published in GMT. Placeholder reviewers from a different
 * market than the shop's tell a visitor the copy was never looked at.
 */
const TESTIMONIALS = [
  {
    name: 'Lukas M.',
    role: 'Verified buyer · Berlin',
    quote:
      'Ordered a Netflix subscription at 1am expecting to wait until morning. The credentials were in my dashboard about two minutes after my payment proof was approved. I have reordered four times since.',
    rating: 5,
    source: 'Google',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Sofia B.',
    role: 'Verified buyer · Milan',
    quote:
      'One account stopped working on day six. I opened a ticket, someone answered within the hour, and it was replaced under warranty the same evening. That is the part I was worried about and it was handled properly.',
    rating: 5,
    source: 'Trustpilot',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Daniel N.',
    role: 'Verified buyer · Prague',
    quote:
      'Prices are shown per currency, so what I saw in USD is exactly what I was charged. No conversion surprise at checkout and no hidden fee added at the end.',
    rating: 5,
    source: 'Google',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Emma L.',
    role: 'Verified buyer · Lyon',
    quote:
      'I buy three or four subscriptions a month for my team. Being able to see every order, its validity date and its warranty window in one dashboard saves me a spreadsheet.',
    rating: 5,
    source: 'Google',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Olivia H.',
    role: 'Verified buyer · Manchester',
    quote:
      'Checkout was straightforward and I could switch payment method when my first one would not go through. Only reason for four stars is that I would like more payment options.',
    rating: 4,
    source: 'Trustpilot',
    isSeed: true,
    isActive: true,
  },
  {
    name: 'Mateusz K.',
    role: 'Verified buyer · Warsaw',
    quote:
      'The 2FA generator alone is worth bookmarking. I use it constantly and it has never asked me to sign in or sent my secret anywhere, which is exactly what it claims.',
    rating: 5,
    source: 'Google',
    isSeed: true,
    isActive: true,
  },
];

async function run() {
  await connectDB();

  // Read the raw document: a hydrated Mongoose read fills schema defaults in memory, so an
  // "is this already set?" check against it could never fire.
  const raw = await Settings.collection.findOne({ singleton: 'main' });
  const existing = raw?.trust || {};

  // Only ever fills a gap. Anything the operator has already entered is theirs and is never
  // overwritten by a seed run, however many times this is executed.
  const patch = {};
  if (!existing.ratingProviders?.length) patch['trust.ratingProviders'] = RATING_PROVIDERS;
  if (!existing.badges?.length) patch['trust.badges'] = BADGES;
  if (!existing.stats?.length) patch['trust.stats'] = STATS;
  if (!existing.reviewsHeading) patch['trust.reviewsHeading'] = 'What customers say about us';

  // Testimonials are the one list a re-run may rewrite — but only when every row still present
  // is seed copy. `isSeed` is what makes that safe: the moment the operator adds or edits one,
  // the list contains something real and the seed leaves it alone entirely.
  const currentTestimonials = existing.testimonials || [];
  const allSeeded = currentTestimonials.length > 0 && currentTestimonials.every((t) => t.isSeed);
  if (currentTestimonials.length === 0 || allSeeded) {
    patch['trust.testimonials'] = TESTIMONIALS;
  }

  if (Object.keys(patch).length === 0) {
    console.log('[seed:trust] trust content already present — nothing changed');
  } else {
    await Settings.updateOne({ singleton: 'main' }, { $set: patch }, { upsert: true });
    console.log(`[seed:trust] seeded: ${Object.keys(patch).join(', ')}`);
  }

  console.log('');
  console.log('[seed:trust] ⚠  The ratings and reviews just written are PLACEHOLDERS.');
  console.log('[seed:trust]    They are not real customers and not real Google/Trustpilot scores.');
  console.log('[seed:trust]    Replace them in Admin → Settings before this site takes real traffic.');

  await disconnectDB();
}

run().catch(async (err) => {
  console.error('[seed:trust] failed:', err);
  await disconnectDB();
  process.exit(1);
});
