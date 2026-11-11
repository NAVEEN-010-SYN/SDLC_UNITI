'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/** Guest carts are authorised by an opaque token sent in this header. */
const CART_TOKEN_HEADER = 'X-Cart-Token';

function createCartController({ cartService }) {
  const token = (req) => req.get(CART_TOKEN_HEADER) || null;

  /** Runs a cart mutation with the caller's identity and returns the view. */
  const mutate = (operation) =>
    asyncHandler(async (req, res) => {
      res.json(await operation(req, req.user || null, token(req)));
    });

  return {
    create: asyncHandler(async (req, res) => {
      const { cart, guestToken } = await cartService.create(req.body, req.user || null);
      if (guestToken) res.set(CART_TOKEN_HEADER, guestToken);
      res
        .status(201)
        .location(`/api/v1/carts/${cart.id}`)
        .json({ ...cart, ...(guestToken ? { guestToken } : {}) });
    }),

    get: mutate((req, principal, guestToken) => cartService.get(req.params.cartId, principal, guestToken)),

    addItem: mutate((req, principal, guestToken) =>
      cartService.addItem(req.params.cartId, req.body, principal, guestToken),
    ),

    updateItem: mutate((req, principal, guestToken) =>
      cartService.updateItem(req.params.cartId, req.params.sku, req.body, principal, guestToken),
    ),

    removeItem: mutate((req, principal, guestToken) =>
      cartService.updateItem(req.params.cartId, req.params.sku, { quantity: 0 }, principal, guestToken),
    ),

    setTerm: mutate((req, principal, guestToken) =>
      cartService.setContractTerm(req.params.cartId, req.body, principal, guestToken),
    ),

    setAddress: mutate((req, principal, guestToken) =>
      cartService.setServiceAddress(req.params.cartId, req.body, principal, guestToken),
    ),

    applyPromo: mutate((req, principal, guestToken) =>
      cartService.applyPromo(req.params.cartId, req.body, principal, guestToken),
    ),

    removePromo: mutate((req, principal, guestToken) => cartService.removePromo(req.params.cartId, principal, guestToken)),

    claim: asyncHandler(async (req, res) => {
      res.json(await cartService.claim(req.params.cartId, token(req), req.user));
    }),
  };
}

module.exports = { createCartController, CART_TOKEN_HEADER };
