process.env.NODE_ENV='test'; process.env.CLIENT_URL='http://localhost:3000';
process.env.JWT_ACCESS_SECRET='a'; process.env.JWT_REFRESH_SECRET='b';
process.env.CREDENTIAL_URL_SECRET='c'; process.env.TOTP_SHARE_SECRET='d';
const { MongoMemoryServer } = require('mongodb-memory-server');
let fail=0;
const assert=(c,l)=>{console.log(`  ${c?'✓':'✗ FAILED:'} ${l}`); if(!c)fail++;};
const caught=async(fn)=>{try{await fn(); return null;}catch(e){return e;}};

(async()=>{
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('rev_test'); process.env.MONGODB_DB_NAME='rev_test';
  const { connectDB } = require('../src/config/db'); await connectDB();
  const mongoose = require('mongoose');
  const Product = require('../src/models/Product');
  const Category = require('../src/models/Category');
  const User = require('../src/models/User');
  const { Order } = require('../src/models/Order');
  const { Review } = require('../src/models/Review');
  const svc = require('../src/services/review.service');

  const cat = await Category.create({ name:'C', slug:'c' });
  const prod = await Product.create({ name:'P', slug:'p', description:'d', price:100, category:cat._id, stock:5, durationDays:30 });
  const other = await Product.create({ name:'Q', slug:'q', description:'d', price:100, category:cat._id, stock:5, durationDays:30 });
  const buyer = await User.create({ email:'b@x.com', name:'Buyer', passwordHash:'x', securityQuestion:'q', securityAnswerHash:'x', role:'user' });
  const stranger = await User.create({ email:'s@x.com', name:'Stranger', passwordHash:'x', securityQuestion:'q', securityAnswerHash:'x', role:'user' });

  const mkOrder = (user, product, status) => Order.create({
    user, orderNumber:'ORD'+Math.random().toString(36).slice(2,9).toUpperCase(), status,
    items:[{ product, name:'P', unitPrice:100, quantity:1, subtotal:100, durationDays:30 }],
    subtotal:100, total:100, currency:'PKR', subtotalPKR:100, totalPKR:100,
    idempotencyKey:'k'+Math.random().toString(36).slice(2),
    paymentMethod:{ id:new mongoose.Types.ObjectId(), name:'Bank', type:'bank', accountTitle:'T', accountNumber:'1' },
  });

  // --- #24 eligibility ---
  let err = await caught(() => svc.createReview(stranger._id, 'p', { rating:5, comment:'never bought' }));
  assert(err && err.statusCode===403, 'a user who never bought the product cannot review it');

  await mkOrder(buyer._id, prod._id, 'pending_payment');
  err = await caught(() => svc.createReview(buyer._id, 'p', { rating:5, comment:'not delivered yet' }));
  assert(err && err.statusCode===403, 'an order that is not delivered does not earn a review');

  await mkOrder(buyer._id, other._id, 'delivered');
  err = await caught(() => svc.createReview(buyer._id, 'p', { rating:5, comment:'wrong product' }));
  assert(err && err.statusCode===403, 'a delivered order for a different product does not earn a review');

  const order = await mkOrder(buyer._id, prod._id, 'delivered');
  const review = await svc.createReview(buyer._id, 'p', { rating:5, comment:'great', tags:['Fast Delivery','Reliable','Not A Real Tag'] });

  // --- #26 pending until approved ---
  assert(review.status==='pending', 'a new review lands in pending');
  assert(String(review.order)===String(order._id) && review.isVerifiedPurchase, 'the qualifying order is recorded on the review');
  assert(review.tags.join()==='Fast Delivery,Reliable', 'unknown tags are dropped, valid ones kept (#28)');

  let pub = await svc.listApprovedReviews('p', { page:1, limit:20 });
  assert(pub.items.length===0, 'a pending review is invisible on the product page');
  assert(!('status' in (pub.items[0]||{})), 'moderation state is never part of a public payload');

  err = await caught(() => svc.createReview(buyer._id, 'p', { rating:4, comment:'again' }));
  assert(err && err.statusCode===409, 'one review per product per customer');

  // --- #26/#27 approval reaches the product page ---
  await svc.adminModerateReview(review._id, 'approved', null);
  pub = await svc.listApprovedReviews('p', { page:1, limit:20 });
  assert(pub.items.length===1 && pub.items[0].comment==='great', 'an approved review shows on the product page');
  assert(pub.items[0].tags.join()==='Fast Delivery,Reliable', 'its tags come through to the public payload');
  assert(pub.items[0].user.reviewer.includes('@') && !pub.items[0].user.reviewer.includes('b@x.com'), 'the reviewer email is masked');
  assert(pub.tagCounts.some(t=>t.tag==='Fast Delivery' && t.count===1), 'tag counts are aggregated for the product');

  let refreshed = await Product.findById(prod._id).lean();
  assert(refreshed.ratingAvg===5 && refreshed.reviewCount===1, "the product's cached rating is recomputed on approval");

  // --- #26 rejection hides it again ---
  await svc.adminModerateReview(review._id, 'rejected', null);
  pub = await svc.listApprovedReviews('p', { page:1, limit:20 });
  assert(pub.items.length===0, 'a rejected review disappears from the product page');
  refreshed = await Product.findById(prod._id).lean();
  assert(refreshed.reviewCount===0, 'and stops counting toward the rating');

  // --- #27 the orphan case that made approval look broken ---
  await svc.adminModerateReview(review._id, 'approved', null);
  await Product.deleteOne({ _id: prod._id });
  const orphanVisible = await caught(() => svc.listApprovedReviews('p', { page:1, limit:20 }));
  assert(orphanVisible && orphanVisible.statusCode===404, 'once its product is gone the review is unreachable — approving it can never help');

  // --- #25 dashboard list ---
  const p2 = await Product.create({ name:'R', slug:'r', description:'d', price:100, category:cat._id, stock:5, durationDays:30 });
  await mkOrder(buyer._id, p2._id, 'delivered');
  const reviewable = await svc.listReviewableProducts(buyer._id);
  assert(reviewable.some(r=>r.slug==='r' && r.canReview), 'a delivered, unreviewed product is offered in the dashboard');
  assert(!(await svc.listReviewableProducts(stranger._id)).length, 'a customer with no delivered orders is offered nothing');

  await mongoose.disconnect(); await mem.stop();
  console.log(fail===0?'\nall good':`\n${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
