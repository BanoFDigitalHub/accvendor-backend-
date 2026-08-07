const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const productService = require('../services/product.service');

const list = asyncHandler(async (req, res) => {
  const { page, limit, category, search, hot, sort } = req.query;
  const result = await productService.listProducts({ page, limit, category, search, hot, sort });
  apiResponse(res, 200, 'Products fetched', {
    products: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

const hot = asyncHandler(async (req, res) => {
  const items = await productService.listHotProducts();
  apiResponse(res, 200, 'Hot products fetched', { products: items });
});

const detail = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);
  apiResponse(res, 200, 'Product fetched', { product });
});

module.exports = { list, hot, detail };
