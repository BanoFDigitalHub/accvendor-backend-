const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const categoryService = require('../services/category.service');

const list = asyncHandler(async (req, res) => {
  const categories = await categoryService.listCategories();
  apiResponse(res, 200, 'Categories fetched', { categories });
});

const detail = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);
  apiResponse(res, 200, 'Category fetched', { category });
});

module.exports = { list, detail };
