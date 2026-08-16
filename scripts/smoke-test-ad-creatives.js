/**
 * An ad creative must outlive every edit that is not a deliberate replacement.
 *
 * This exists because a live ad's image was destroyed in production and nobody could see why.
 * The audit log had the whole sequence: two ads were pointed at the same Cloudinary upload, one
 * of them was deleted five seconds later, and `deleteAd` destroyed the shared asset out from
 * under the survivor. It went unnoticed for a day because Cloudinary keeps serving a destroyed
 * asset from its CDN edge for a while — the ad rendered fine all afternoon and was blank the
 * next morning, so the blame never landed on the delete.
 *
 * Two rules are proved here, and both are about `destroyAsset` being account-wide while an ad
 * row is not:
 *
 *   1. **Nothing is destroyed while any ad still references it** — as its `imagePublicId`, or
 *      inside its `imageUrl` (a pasted URL is stored with no publicId at all, so the URL has to
 *      count as a claim or a shared creative looks unreferenced).
 *   2. **A save that never touched the creative never destroys it.** The old check was a bare
 *      string comparison on `imageUrl`, so the same asset arriving under any other spelling read
 *      as a replacement. Ownership is also re-attached when the client sends the URL back with a
 *      null publicId, which the admin form does on any keystroke in its URL box.
 *
 * `destroyAsset` is stubbed: the assertion is on the decision, not on a Cloudinary call.
 */
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.CREDENTIAL_URL_SECRET = 'test_credential_secret';
process.env.BCRYPT_SALT_ROUNDS = '4';

const { MongoMemoryServer } = require('mongodb-memory-server');

let pass = 0;
let fail = 0;

function assert(cond, label, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ FAILED: ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const SHARED = 'accvendor/ad-images/tester/shared_creative';
const SHARED_URL = `https://res.cloudinary.com/demo/image/upload/v1/${SHARED}.jpg`;
const SOLO = 'accvendor/ad-images/tester/solo_creative';
const SOLO_URL = `https://res.cloudinary.com/demo/image/upload/v1/${SOLO}.jpg`;

async function run() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('accvendor_ad_creative_test');
  process.env.MONGODB_DB_NAME = 'accvendor_ad_creative_test';

  // Stubbed before admin/ad.service.js destructures it off the module.
  const uploadService = require('../src/services/upload.service');
  const destroyed = [];
  uploadService.destroyAsset = async (publicId) => {
    destroyed.push(publicId);
    return true;
  };

  const { connectDB, disconnectDB } = require('../src/config/db');
  await connectDB();
  const { Ad } = require('../src/models/Ad');
  const { env } = require('../src/config/env');
  const adService = require('../src/services/admin/ad.service');

  const newAd = (name, over = {}) =>
    Ad.create({ name, type: 'banner', placement: 'top', imageUrl: SHARED_URL, imagePublicId: SHARED, ...over });

  try {
    console.log('\n  Cleanup is off by default');
    const off = await newAd('default off');
    destroyed.length = 0;
    await adService.updateAd(String(off._id), { imageUrl: SOLO_URL, imagePublicId: SOLO });
    await adService.deleteAd(String(off._id));
    assert(
      destroyed.length === 0,
      'with ADS_DELETE_UNUSED_CREATIVES unset, no ad edit destroys anything',
      `destroyed ${JSON.stringify(destroyed)}`
    );

    // Everything below is the behaviour of the opt-in housekeeping. The reference rules have to
    // hold there too — turning cleanup on must not reintroduce the shared-creative bug.
    env.cloudinary.deleteUnusedAdCreatives = true;

    console.log('\n  With cleanup on: a creative shared by two ads');
    const a = await newAd('shared A');
    const b = await newAd('shared B');

    destroyed.length = 0;
    await adService.deleteAd(String(a._id));
    assert(
      destroyed.length === 0,
      'deleting one of two ads sharing a creative leaves the asset alone',
      `destroyed ${JSON.stringify(destroyed)}`
    );

    destroyed.length = 0;
    await adService.deleteAd(String(b._id));
    assert(
      destroyed.length === 1 && destroyed[0] === SHARED,
      'deleting the last ad holding it does destroy the asset',
      `destroyed ${JSON.stringify(destroyed)}`
    );

    console.log('\n  A save that did not touch the creative');
    const c = await newAd('editing');

    destroyed.length = 0;
    await adService.updateAd(String(c._id), { priority: 5, imageUrl: SHARED_URL, imagePublicId: SHARED });
    assert(destroyed.length === 0, 're-saving with the same image keeps it', `destroyed ${JSON.stringify(destroyed)}`);

    destroyed.length = 0;
    await adService.updateAd(String(c._id), { imageUrl: SHARED_URL, imagePublicId: null });
    const afterNull = await Ad.findById(c._id).lean();
    assert(destroyed.length === 0, 'a save that drops imagePublicId keeps the image', `destroyed ${JSON.stringify(destroyed)}`);
    assert(afterNull.imagePublicId === SHARED, '...and re-attaches ownership so it can still be cleaned up later', `got ${afterNull.imagePublicId}`);

    console.log('\n  A deliberate replacement');
    destroyed.length = 0;
    await adService.updateAd(String(c._id), { imageUrl: SOLO_URL, imagePublicId: SOLO });
    assert(
      destroyed.length === 1 && destroyed[0] === SHARED,
      'swapping the creative destroys the one it replaced',
      `destroyed ${JSON.stringify(destroyed)}`
    );

    destroyed.length = 0;
    await adService.updateAd(String(c._id), { imageUrl: null, imagePublicId: null, title: 'text only ad' });
    assert(
      destroyed.length === 1 && destroyed[0] === SOLO,
      'clearing the image destroys the creative',
      `destroyed ${JSON.stringify(destroyed)}`
    );

    console.log('\n  ...but never one somebody else is using');
    const d = await newAd('holder', { imageUrl: SOLO_URL, imagePublicId: SOLO });
    // Stored the way a pasted URL is: the asset is referenced, but not claimed by publicId.
    await newAd('paster', { imageUrl: SOLO_URL, imagePublicId: null });

    destroyed.length = 0;
    await adService.updateAd(String(d._id), { imageUrl: SHARED_URL, imagePublicId: SHARED });
    assert(
      destroyed.length === 0,
      'replacing a shared creative leaves it for the ad that pasted its URL',
      `destroyed ${JSON.stringify(destroyed)}`
    );
  } finally {
    await disconnectDB();
    await mem.stop();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
