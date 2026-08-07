const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const cartService = require('../services/cart.service');

const get = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.user._id);
  apiResponse(res, 200, 'Cart fetched', { cart });
});

const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const cart = await cartService.addItem(req.user._id, productId, quantity);
  apiResponse(res, 200, 'Item added to cart', { cart });
});

const updateItem = asyncHandler(async (req, res) => {
  const cart = await cartService.updateItem(req.user._id, req.params.productId, req.body.quantity);
  apiResponse(res, 200, 'Cart item updated', { cart });
});

const removeItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeItem(req.user._id, req.params.productId);
  apiResponse(res, 200, 'Item removed from cart', { cart });
});

const merge = asyncHandler(async (req, res) => {
  const cart = await cartService.mergeCart(req.user._id, req.body.items);
  apiResponse(res, 200, 'Cart merged', { cart });
});

module.exports = { get, addItem, updateItem, removeItem, merge };
