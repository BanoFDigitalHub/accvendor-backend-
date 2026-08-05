const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');

async function listCategories() {
  const items = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
  return items;
}

async function getCategoryBySlug(slug) {
  const category = await Category.findOne({ slug, isActive: true }).lean();
  if (!category) throw new ApiError(404, 'Category not found');
  return category;
}

module.exports = { listCategories, getCategoryBySlug };
