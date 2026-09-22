import type { z } from "zod";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import {
  getCart,
  addCartLineItem,
  createCart,
  removeCartLineItem,
  applyCartPromotion,
  updateCartLineItem,
} from "../utils/medusa";
import { captureRecommendationSignal } from "../utils/recommendation-actor";
import { config } from "../utils/config";
import type { CartResult } from "../utils/schemas";

// Cart drawer state (open or closed) with initial value (false) and no persistent state (local storage)
export const isCartDrawerOpen = atom(false);

// Cart is updating state (true or false) with initial value (false) and no persistent state (local storage)
export const isCartUpdating = atom(false);

// Keep API failures visible in the drawer and on the add-to-cart form.
export const cartError = atom<string | null>(null);

// A user can click controls quickly enough to overlap calls. All cart
// mutations share this queue so the server receives them in user order.
let mutationQueue: Promise<void> = Promise.resolve();
let mutationVersion = 0;
let mutationGeneration = 0;

const isCurrentMutation = (version: number) => version === mutationVersion;

const publishMutationError = (version: number, error: unknown) => {
  if (!isCurrentMutation(version)) return;
  cartError.set(error instanceof Error ? error.message : String(error));
  isCartDrawerOpen.set(true);
};

const enqueueMutation = <T>(
  operation: (version: number) => Promise<T>,
): Promise<T | undefined> => {
  const generation = mutationGeneration;
  const run = mutationQueue.then(async () => {
    if (generation !== mutationGeneration) return undefined;

    const version = ++mutationVersion;
    isCartUpdating.set(true);
    cartError.set(null);

    try {
      return await operation(version);
    } catch (error) {
      publishMutationError(version, error);
      throw error;
    } finally {
      if (isCurrentMutation(version)) isCartUpdating.set(false);
    }
  });

  // A rejected mutation must not prevent later queued mutations from running.
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

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
export function addCartItem(item: {
  id: string;
  quantity: number;
  promotionCode?: string;
}) {
  return enqueueMutation(async (version) => {
    const cartId = cart.get()?.id;
    let cartData = cartId
      ? await addCartLineItem(cartId, item.id, item.quantity)
      : await createCart(item.id, item.quantity);

    if (!cartData) {
      throw new Error("Medusa returned no cart after adding the item");
    }

    if (item.promotionCode) {
      try {
        const promotedCart = await applyCartPromotion(
          cartData.id,
          item.promotionCode,
        );
        if (!promotedCart) {
          throw new Error("Medusa returned no cart after applying the code");
        }
        cartData = promotedCart;
      } catch (error) {
        if (isCurrentMutation(version)) cart.set(cartData);
        throw new Error(
          `The item was added, but promotion ${item.promotionCode} could not be applied: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!isCurrentMutation(version)) return;
    cart.set(cartData);
    cartError.set(null);
    isCartDrawerOpen.set(true);
    if (config.recommendationsEnabled) {
      const added = cartData.items?.find((line) => line.variant_id === item.id);
      if (added?.product_id) {
        const related = [
          ...new Set(
            (cartData.items ?? [])
              .map((line) => line.product_id)
              .filter(
                (id): id is string =>
                  typeof id === "string" && id !== added.product_id,
              ),
          ),
        ].slice(0, 20);
        void captureRecommendationSignal({
          event_type: "cart",
          product_id: added.product_id,
          related_product_ids: related,
          idempotency_key: `cart:${cartData.id}:${added.product_id}:${added.quantity}`,
        }).catch((error) =>
          console.warn("Recommendation cart signal was not recorded", error),
        );
      }
    }
  });
}

// Reset the cart to empty — used after a successful checkout, since the
// Medusa cart backing it has just been converted into an order and is no
// longer usable.
export function clearCart() {
  mutationGeneration += 1;
  mutationVersion += 1;
  cart.set(emptyCart);
  cartError.set(null);
  isCartUpdating.set(false);
}

export function removeCartItems(lineIds: string[]) {
  return enqueueMutation(async (version) => {
    const cartId = cart.get()?.id;
    if (!cartId) return;

    let cartData = null;
    for (const lineId of lineIds) {
      if (!isCurrentMutation(version)) return;
      cartData = await removeCartLineItem(cartId, lineId);
    }

    if (cartData && isCurrentMutation(version)) {
      cart.set(cartData);
    }
  });
}

export function updateCartItem(lineId: string, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    const error = new Error("Quantity must be a whole number of zero or more");
    cartError.set(error.message);
    return Promise.reject(error);
  }

  return enqueueMutation(async (version) => {
    const cartId = cart.get()?.id;
    if (!cartId) {
      throw new Error(
        "Your cart is no longer available. Refresh and try again.",
      );
    }

    const cartData = await updateCartLineItem(cartId, lineId, quantity);
    if (!cartData) {
      throw new Error("Medusa returned no cart after updating the item");
    }
    if (isCurrentMutation(version)) {
      cart.set(cartData);
      cartError.set(null);
    }
  });
}
