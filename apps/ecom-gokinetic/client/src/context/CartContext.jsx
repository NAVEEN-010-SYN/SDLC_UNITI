import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * Shopping cart state shared across the storefront.
 *
 * The cart id and (for guests) its access token persist in localStorage so a
 * shopper can come back to the same cart. After sign-in the guest cart is
 * claimed, which merges it into any cart the user already has.
 */

const STORAGE_KEY = 'gk.cart';
const CartContext = createContext(null);

function readStored() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-persistent cart is acceptable.
  }
}

/** Problems that mean the stored cart is gone for good. */
const DEAD_CART = (err) => err && (err.status === 404 || err.status === 403 || err.code === 'CART_CLOSED');

export function CartProvider({ children }) {
  const { endpoints, isAuthenticated, user } = useAuth();
  const [cart, setCart] = useState(null);
  const [pending, setPending] = useState(false);
  const ref = useRef(readStored());

  const remember = useCallback((next, guestToken) => {
    ref.current = next ? { cartId: next.id, guestToken: guestToken ?? ref.current?.guestToken ?? null, segment: next.segment } : null;
    writeStored(ref.current);
    setCart(next);
  }, []);

  const reset = useCallback(() => remember(null), [remember]);

  // Load the stored cart on mount, claim it after login.
  useEffect(() => {
    const stored = ref.current;
    if (!stored) return;
    const load = isAuthenticated && stored.guestToken
      ? endpoints.carts.claim(stored.cartId, stored.guestToken).then((c) => remember(c, null))
      : endpoints.carts.get(stored.cartId, stored.guestToken).then((c) => remember(c));
    load.catch((err) => {
      if (DEAD_CART(err)) reset();
    });
  }, [isAuthenticated, endpoints, remember, reset]);

  /** Returns the current cart id, creating a cart for `segment` on first use. */
  const ensureCart = useCallback(
    async (segment) => {
      const stored = ref.current;
      if (stored && stored.segment === segment) return stored;
      const { cart: created, guestToken } = await endpoints.carts.create(segment);
      remember(created, guestToken);
      return ref.current;
    },
    [endpoints, remember],
  );

  /** Wraps a cart mutation: tracks pending state and recovers from a dead cart. */
  const run = useCallback(
    async (operation) => {
      setPending(true);
      try {
        const { cartId, guestToken } = ref.current;
        const next = await operation(cartId, guestToken);
        remember(next);
        return next;
      } catch (err) {
        if (DEAD_CART(err)) reset();
        throw err;
      } finally {
        setPending(false);
      }
    },
    [remember, reset],
  );

  const segmentFor = useCallback(() => (user && user.segment) || ref.current?.segment || 'CONSUMER', [user]);

  const value = useMemo(
    () => ({
      cart,
      pending,
      itemCount: cart ? cart.items.reduce((n, i) => n + i.quantity, 0) : 0,
      async addItem(sku, quantity = 1, segment = segmentFor()) {
        await ensureCart(segment);
        return run((id, token) => endpoints.carts.addItem(id, token, sku, quantity));
      },
      updateQuantity: (sku, quantity) => run((id, token) => endpoints.carts.updateItem(id, token, sku, quantity)),
      removeItem: (sku) => run((id, token) => endpoints.carts.removeItem(id, token, sku)),
      setTerm: (months) => run((id, token) => endpoints.carts.setTerm(id, token, months)),
      async setAddress(address, segment = segmentFor()) {
        await ensureCart(segment);
        return run((id, token) => endpoints.carts.setAddress(id, token, address));
      },
      applyPromo: (code) => run((id, token) => endpoints.carts.applyPromo(id, token, code)),
      removePromo: () => run((id, token) => endpoints.carts.removePromo(id, token)),
      refresh: () => run((id, token) => endpoints.carts.get(id, token)),
      /** Called after a successful order: the server has closed the cart. */
      clear: reset,
    }),
    [cart, pending, ensureCart, run, endpoints, reset, segmentFor],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
