import type { z } from "zod";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import {
  getCart,
  addCartLineItem,
  createCart,
  removeCartLineItem,
} from "../utils/medusa";
import type { CartResult } from "../utils/schemas";

// Cart drawer state (open or closed) with initial value (false) and no persistent state (local storage)
export const isCartDrawerOpen = atom(false);

// Cart is updating state (true or false) with initial value (false) and no persistent state (local storage)
export const isCartUpdating = atom(false);

const emptyCart = {
  id: "",
  currency_code: "",
  item_total: 0,
  subtotal: 0,
  total: 0,
  items: [],
  shipping_methods: [],
};

// Cart store with persistent state (local storage) and initial value.
// The Medusa cart ID (`id`) lives inside this same persisted object, so
// re-hydrating the cart on a new session only needs this one atom.
export const cart = persistentAtom<z.infer<typeof CartResult>>(
  "cart",
  emptyCart,
  {
    encode: JSON.stringify,
    decode: JSON.parse,
  },
);

// Fetch cart data if a cart exists in local storage, this is called during session start only
// This is useful to validate if the cart still exists in Medusa and if it's not empty
// Medusa doesn't automatically delete carts, but they can be invalidated once completed
export async function initCart() {
  const sessionStarted = sessionStorage.getItem("sessionStarted");
  if (!sessionStarted) {
    sessionStorage.setItem("sessionStarted", "true");
    const localCart = cart.get();
    const cartId = localCart?.id;
    if (cartId) {
      const data = await getCart(cartId);

      if (data) {
        cart.set(data);
      } else {
        // If the cart doesn't exist in Medusa anymore, reset the cart store
        cart.set(emptyCart);
      }
    }
  }
}

// Add item to cart or create a new cart if it doesn't exist yet
export async function addCartItem(item: { id: string; quantity: number }) {
  const localCart = cart.get();
  const cartId = localCart?.id;

  isCartUpdating.set(true);

  const cartData = cartId
    ? await addCartLineItem(cartId, item.id, item.quantity)
    : await createCart(item.id, item.quantity);

  if (cartData) {
    cart.set(cartData);
    isCartUpdating.set(false);
    isCartDrawerOpen.set(true);
  } else {
    isCartUpdating.set(false);
  }
}

// Reset the cart to empty — used after a successful checkout, since the
// Medusa cart backing it has just been converted into an order and is no
// longer usable.
export function clearCart() {
  cart.set(emptyCart);
}

export async function removeCartItems(lineIds: string[]) {
  const localCart = cart.get();
  const cartId = localCart?.id;

  isCartUpdating.set(true);

  if (cartId) {
    let cartData = null;
    for (const lineId of lineIds) {
      cartData = await removeCartLineItem(cartId, lineId);
    }

    if (cartData) {
      cart.set(cartData);
    }
    isCartUpdating.set(false);
  }
}
