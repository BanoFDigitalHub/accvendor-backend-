const Product = require('../models/Product');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { getRates } = require('./settings.service');
const { allPrices, priceInCurrency, DEFAULT_CURRENCY } = require('../utils/money');
const { optimizedUrl, srcSetFor } = require('./upload.service');

/**
 * Shapes a product for public consumption.
 *
 * `prices` carries every currency at once so the storefront's currency switcher is instant and
 * purely presentational — it never refetches, and it never computes an amount the server didn't
 * authorise. `price`/`salePrice`/`effectivePrice` stay as the PKR base values so existing
 * readers keep working.
 */
function toPublicProduct(p, rates) {
  const prices = allPrices(p, rates);
  return {
    id: p._id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    images: (p.images || []).map((url) => optimizedUrl(url)),
    // Parallel array of `srcset` strings (null where the image isn't a Cloudinary asset we can
    // transform), so the storefront can hand the browser a size that suits the slot instead of
    // always downloading the 800px one.
    imageSrcSets: (p.images || []).map((url) => srcSetFor(url)),
    tags: p.tags || [],
    category: p.category,

    // Base (PKR) — unchanged field names, so nothing downstream had to be touched.
    price: p.price,
    salePrice: p.salePrice,
    effectivePrice: p.salePrice != null ? p.salePrice : p.price,
    // Every currency, resolved server-side.
    prices,

    durationDays: p.durationDays,
    // Validity (how long the account works) and warranty (how long it can still be cancelled)
    // are independent — each has a numeric driver and an optional admin-written display label.
    warrantyDays: p.warrantyDays || 0,
    warranty: p.warranty || '',
    validity: p.validity || '',

    stock: p.stock,
    inStock: p.stock > 0,
    isHotProduct: p.isHotProduct,
    ratingAvg: p.ratingAvg,
    reviewCount: p.reviewCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Public listings never show a sold-out product.
 *
 * A card that says "Sold Out" is an advert for something nobody can buy: it takes a slot in a
 * grid, it is the first thing a first-time visitor sees if it sorts to the front, and clicking
 * it is a dead end. Stock is the shop's own state, so this is enforced here rather than being
 * filtered in each of the four places that render a grid.
 *
 * `getProductBySlug` deliberately does *not* apply it — an emailed or bookmarked link to a
 * product that has just run out should still open and say so, rather than 404.
 */
const IN_STOCK = { isActive: true, stock: { $gt: 0 } };

async function listProducts({ page, limit, category, search, hot, sort, currency }) {
  const filter = { ...IN_STOCK };

  if (category) {
    const cat = await Category.findOne({ slug: category, isActive: true }).lean();
    if (!cat) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }
    filter.category = cat._id;
  }

  if (hot !== undefined) filter.isHotProduct = hot;

  // Substring match rather than $text: a shopper typing "net" expects "Netflix", and $text only
  // matches whole stemmed words. The input is escaped so a regex metacharacter in the query is
  // matched literally instead of turning into a pattern (or a catastrophic backtrack).
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ name: rx }, { tags: rx }];
  }

  const sortMap = {
    newest: { createdAt: -1 },
    priceAsc: { price: 1 },
    priceDesc: { price: -1 },
  };

  const skip = (page - 1) * limit;

  const [items, total, rates] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
    getRates(),
  ]);

  return {
    items: items.map((p) => toPublicProduct(p, rates)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    currency: currency || DEFAULT_CURRENCY,
  };
}

async function getProductBySlug(slug) {
  const [product, rates] = await Promise.all([
    Product.findOne({ slug, isActive: true }).populate('category', 'name slug').lean(),
    getRates(),
  ]);
  if (!product) throw new ApiError(404, 'Product not found');
  return toPublicProduct(product, rates);
}

async function listHotProducts(limit = 8) {
  const [items, rates] = await Promise.all([
    Product.find({ ...IN_STOCK, isHotProduct: true })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    getRates(),
  ]);
  return items.map((p) => toPublicProduct(p, rates));
}

/**
 * Server-authoritative unit price for one product in one currency.
 *
 * Order creation and coupon evaluation both go through this, so a price can never come from
 * the client — the request only ever names a product and a currency.
 */
async function resolveUnitPrice(product, currency, rates) {
  const resolved = priceInCurrency(product, currency, rates);
  return resolved.effectivePrice;
}

module.exports = { listProducts, getProductBySlug, listHotProducts, toPublicProduct, resolveUnitPrice };
