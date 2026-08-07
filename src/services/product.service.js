const Product = require('../models/Product');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');

function toPublicProduct(p) {
  return {
    id: p._id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    images: p.images,
    tags: p.tags || [],
    category: p.category,
    price: p.price,
    salePrice: p.salePrice,
    effectivePrice: p.salePrice != null ? p.salePrice : p.price,
    usdPrice: p.usdPrice,
    eurPrice: p.eurPrice,
    durationDays: p.durationDays,
    stock: p.stock,
    inStock: p.stock > 0,
    isHotProduct: p.isHotProduct,
    ratingAvg: p.ratingAvg,
    reviewCount: p.reviewCount,
    createdAt: p.createdAt,
  };
}

async function listProducts({ page, limit, category, search, hot, sort }) {
  const filter = { isActive: true };

  if (category) {
    const cat = await Category.findOne({ slug: category, isActive: true }).lean();
    if (!cat) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }
    filter.category = cat._id;
  }

  if (hot !== undefined) filter.isHotProduct = hot;
  if (search) filter.$text = { $search: search };

  const sortMap = {
    newest: { createdAt: -1 },
    priceAsc: { price: 1 },
    priceDesc: { price: -1 },
  };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(sortMap[sort])
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return {
    items: items.map(toPublicProduct),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, isActive: true }).populate('category', 'name slug').lean();
  if (!product) throw new ApiError(404, 'Product not found');
  return toPublicProduct(product);
}

async function listHotProducts(limit = 8) {
  const items = await Product.find({ isActive: true, isHotProduct: true })
    .populate('category', 'name slug')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return items.map(toPublicProduct);
}

module.exports = { listProducts, getProductBySlug, listHotProducts };
