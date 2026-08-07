process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.BCRYPT_SALT_ROUNDS = '4';

const { MongoMemoryServer } = require('mongodb-memory-server');

let pass = 0;
let fail = 0;

function assert(cond, label) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ FAILED: ${label}`);
  }
}

async function run() {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('accvendor_products_test');
  process.env.MONGODB_DB_NAME = 'accvendor_products_test';

  const { connectDB } = require('../src/config/db');
  await connectDB();
  const Category = require('../src/models/Category');
  const Product = require('../src/models/Product');
  const app = require('../src/app');

  const streaming = await Category.create({ name: 'Streaming', slug: 'streaming' });
  const gaming = await Category.create({ name: 'Gaming', slug: 'gaming' });

  await Product.create([
    {
      name: 'Netflix',
      slug: 'netflix',
      description: 'desc',
      category: streaming._id,
      price: 500,
      salePrice: 450,
      durationDays: 30,
      stock: 5,
      isHotProduct: true,
    },
    {
      name: 'Spotify',
      slug: 'spotify',
      description: 'desc',
      category: streaming._id,
      price: 300,
      durationDays: 30,
      stock: 0,
    },
    {
      name: 'Xbox Pass',
      slug: 'xbox-pass',
      description: 'desc',
      category: gaming._id,
      price: 1200,
      durationDays: 30,
      stock: 10,
      isHotProduct: true,
    },
    {
      name: 'Hidden Inactive Product',
      slug: 'hidden-inactive',
      description: 'desc',
      category: gaming._id,
      price: 100,
      durationDays: 30,
      stock: 10,
      isActive: false,
    },
  ]);

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    let res = await fetch(`${base}/api/categories`);
    let body = await res.json();
    assert(res.status === 200 && body.data.categories.length === 2, 'categories list returns both categories');

    res = await fetch(`${base}/api/products`);
    body = await res.json();
    assert(res.status === 200 && body.data.products.length === 3, 'inactive product excluded from listing');
    assert(body.data.pagination.total === 3, 'pagination total matches active product count');

    res = await fetch(`${base}/api/products?category=gaming`);
    body = await res.json();
    assert(
      res.status === 200 && body.data.products.length === 1 && body.data.products[0].slug === 'xbox-pass',
      'category filter narrows results correctly'
    );

    res = await fetch(`${base}/api/products?limit=1&page=2&sort=priceAsc`);
    body = await res.json();
    assert(res.status === 200 && body.data.pagination.totalPages === 3, 'pagination math correct with limit=1');

    res = await fetch(`${base}/api/products/hot`);
    body = await res.json();
    assert(res.status === 200 && body.data.products.length === 2, 'hot products endpoint returns only hot items');

    res = await fetch(`${base}/api/products/netflix`);
    body = await res.json();
    assert(
      res.status === 200 && body.data.product.effectivePrice === 450 && body.data.product.inStock === true,
      'detail endpoint computes effectivePrice (sale price) and inStock correctly'
    );

    res = await fetch(`${base}/api/products/spotify`);
    body = await res.json();
    assert(body.data.product.inStock === false, 'zero-stock product reports inStock=false');

    res = await fetch(`${base}/api/products/hidden-inactive`);
    assert(res.status === 404, 'inactive product is not fetchable by slug (404)');

    res = await fetch(`${base}/api/products/does-not-exist`);
    assert(res.status === 404, 'unknown slug returns 404');

    res = await fetch(`${base}/api/products?page=0`);
    assert(res.status === 400, 'invalid pagination (page=0) is rejected by validation');
  } finally {
    server.close();
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    await mem.stop();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
