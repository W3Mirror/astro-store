import { z } from "zod";
import {
  CalculatedPriceResult,
  CartResult,
  CategoryListResult,
  CategoryResult,
  MoneyResult,
  OrderResult,
  OrderTrackingResult,
  PaymentCollectionResult,
  PaymentOptionsResult,
  ProductPageResult,
  ProductResult,
  RegionResult,
  ShippingOptionResult,
  StoreRecommendationsResult,
} from "./schemas";
import { config } from "./config";

// Fields requested on top of Medusa's defaults for /store/products so we get
// calculated prices (needs `region_id`), inventory and variant options.
// `+` adds to the default field set, `*` expands a relation.
const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,+variants.allow_backorder,+variants.manage_inventory,*variants.options,+options,+images,+categories.id,+categories.name";

// Cart line items don't include per-item totals by default, only the unit
// price — request them explicitly. Shipping methods default to amount/option
// id only, so the checkout's shipping step also needs the method's name.
const CART_FIELDS =
  "+items.total,+items.subtotal,+shipping_methods.id,+shipping_methods.name";

const buildUrl = (path: string, params: Record<string, unknown> = {}) => {
  const url = new URL(path, config.medusaBackendUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};

// Medusa error responses are JSON (`{ message, type, ... }`). Fall back to
// the raw body for non-JSON errors (e.g. an upstream proxy/502 page) so
// callers always get a readable, user-facing message.
const extractErrorMessage = async (response: Response) => {
  const responseBody = await response.text();

  try {
    const parsed = JSON.parse(responseBody);
    return parsed?.message || responseBody || response.statusText;
  } catch {
    return responseBody || response.statusText;
  }
};

// Make a request to Medusa's Store REST API, adding the publishable API key
// header required on every /store/* request.
const medusaFetch = async <T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> => {
  const { method = "GET", params, body } = options;

  const response = await fetch(buildUrl(path, params), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": config.medusaPublishableKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return response.json();
};

export interface ProductPageOptions {
  limit?: number;
  offset?: number;
  q?: string;
  collectionId?: string;
  categoryId?: string;
  order?: string;
}

const PRODUCT_PAGE_MAX_LIMIT = 500;
const PRODUCT_PAGE_MAX_OFFSET = 100_000;

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value as number));
};

const trimmedParam = (value: string | undefined, maximumLength = 200) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maximumLength) : undefined;
};

// Get a bounded product page while retaining the configured region for all
// storefront requests. The Store API returns count/offset/limit metadata that
// is needed by the catalog route's pagination controls.
export const getProductPage = async (options: ProductPageOptions = {}) => {
  const limit = boundedInteger(options.limit, 10, 1, PRODUCT_PAGE_MAX_LIMIT);
  const offset = boundedInteger(options.offset, 0, 0, PRODUCT_PAGE_MAX_OFFSET);

  const data = await medusaFetch<unknown>("/store/products", {
    params: {
      limit,
      offset,
      q: trimmedParam(options.q),
      collection_id: trimmedParam(options.collectionId),
      category_id: trimmedParam(options.categoryId),
      order: trimmedParam(options.order, 80),
      region_id: config.medusaRegionId,
      fields: PRODUCT_FIELDS,
    },
  });

  return ProductPageResult.parse(data);
};

// Compatibility wrapper used by the homepage, sitemap, and llms endpoint.
// Those callers intentionally need only the product array.
export const getProducts = async (options: ProductPageOptions = {}) => {
  const page = await getProductPage(options);
  return page.products;
};

// Get a product by its handle (slug)
export const getProductByHandle = async (options: { handle: string }) => {
  const { handle } = options;

  const data = await medusaFetch<{ products: unknown[] }>("/store/products", {
    params: {
      handle,
      limit: 1,
      region_id: config.medusaRegionId,
      fields: PRODUCT_FIELDS,
    },
  });

  const product = data.products?.[0] ?? null;
  const parsedProduct = ProductResult.parse(product);

  return parsedProduct;
};

const COLLECTIONS_MAX_LIMIT = 100;

// List every storefront-visible collection (a Medusa product category —
// see `CategoryResult`'s doc comment). `/store/product-categories` already
// filters to active, non-internal categories server-side.
export const getCollections = async (
  options: { limit?: number; offset?: number } = {},
) => {
  const limit = boundedInteger(options.limit, 50, 1, COLLECTIONS_MAX_LIMIT);
  const offset = boundedInteger(options.offset, 0, 0, PRODUCT_PAGE_MAX_OFFSET);

  const data = await medusaFetch<unknown>("/store/product-categories", {
    params: {
      limit,
      offset,
      fields: "id,name,handle,description",
    },
  });

  return CategoryListResult.parse(data);
};

// Get a collection by its handle (slug), or null if none matches — the
// caller renders a 404 in that case, same convention as
// `getProductByHandle`.
export const getCollectionByHandle = async (options: { handle: string }) => {
  const { handle } = options;

  const data = await medusaFetch<{ product_categories: unknown[] }>(
    "/store/product-categories",
    {
      params: {
        handle,
        limit: 1,
        fields: "id,name,handle,description",
      },
    },
  );

  const category = data.product_categories?.[0] ?? null;
  return CategoryResult.parse(category);
};

// Medusa's Store API has no dedicated recommendations endpoint, so we fall
// back to other products in the same category (the many-to-many model
// collections are migrating onto — see
// `docs-internal/collections-many-to-many.mdx`), or the same legacy
// collection for a store not yet backfilled onto categories. `categoryId`
// takes priority; `collectionId` is used only when no category is given.
export const getProductRecommendations = async (options: {
  productId: string;
  categoryId?: string | null;
  collectionId?: string | null;
  limit?: number;
}) => {
  const { productId, categoryId, collectionId, limit = 4 } = options;

  if (!categoryId && !collectionId) {
    return [];
  }

  const data = await medusaFetch<{ products: unknown[] }>("/store/products", {
    params: categoryId
      ? {
          category_id: categoryId,
          region_id: config.medusaRegionId,
          limit: limit + 1,
          fields: PRODUCT_FIELDS,
        }
      : {
          collection_id: collectionId,
          region_id: config.medusaRegionId,
          limit: limit + 1,
          fields: PRODUCT_FIELDS,
        },
  });

  const ProductsResult = z.array(ProductResult);
  const parsedProducts = ProductsResult.parse(data.products).filter(
    (product) => product?.id !== productId,
  );

  return parsedProducts.slice(0, limit);
};

export const getStoreRecommendations = async (options: {
  anchorProductIds?: string[];
  excludeProductIds?: string[];
  limit?: number;
}) => {
  const data = await medusaFetch<unknown>("/store/recommendations", {
    params: {
      anchor_product_ids: (options.anchorProductIds ?? [])
        .slice(0, 10)
        .join(","),
      exclude_product_ids: (options.excludeProductIds ?? [])
        .slice(0, 20)
        .join(","),
      limit: Math.max(1, Math.min(8, options.limit ?? 4)),
    },
  });
  return StoreRecommendationsResult.parse(data).recommendations;
};

// Create a cart with a first line item and return the cart object
export const createCart = async (variantId: string, quantity: number) => {
  const data = await medusaFetch<{ cart: unknown }>("/store/carts", {
    method: "POST",
    params: { fields: CART_FIELDS },
    body: {
      region_id: config.medusaRegionId,
      items: [{ variant_id: variantId, quantity }],
    },
  });

  const parsedCart = CartResult.parse(data.cart);

  return parsedCart;
};

// Add a line item to an existing cart (by ID) and return the updated cart object
export const addCartLineItem = async (
  cartId: string,
  variantId: string,
  quantity: number,
) => {
  const data = await medusaFetch<{ cart: unknown }>(
    `/store/carts/${cartId}/line-items`,
    {
      method: "POST",
      params: { fields: CART_FIELDS },
      body: { variant_id: variantId, quantity },
    },
  );

  const parsedCart = CartResult.parse(data.cart);

  return parsedCart;
};

// Update the quantity of an existing cart line. Medusa accepts quantity 0 and
// removes the line, which keeps quantity controls and delete behavior in sync.
export const updateCartLineItem = async (
  cartId: string,
  lineId: string,
  quantity: number,
) => {
  const data = await medusaFetch<{ cart: unknown }>(
    `/store/carts/${cartId}/line-items/${lineId}`,
    {
      method: "POST",
      params: { fields: CART_FIELDS },
      body: { quantity },
    },
  );

  return CartResult.parse(data.cart);
};

export const applyCartPromotion = async (cartId: string, code: string) => {
  const data = await medusaFetch<{ cart: unknown }>(
    `/store/carts/${cartId}/promotions`,
    {
      method: "POST",
      params: { fields: CART_FIELDS },
      body: { promo_codes: [code] },
    },
  );
  return CartResult.parse(data.cart);
};

// Remove a line item from an existing cart (by ID) and return the updated cart object
export const removeCartLineItem = async (cartId: string, lineId: string) => {
  const data = await medusaFetch<{ parent: unknown }>(
    `/store/carts/${cartId}/line-items/${lineId}`,
    {
      method: "DELETE",
      params: { fields: CART_FIELDS },
    },
  );

  const parsedCart = CartResult.parse(data.parent);

  return parsedCart;
};

// Get a cart by its ID and return the cart object, or null if it no longer
// exists (e.g. it was completed or has expired).
export const getCart = async (cartId: string) => {
  const response = await fetch(
    buildUrl(`/store/carts/${cartId}`, { fields: CART_FIELDS }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": config.medusaPublishableKey,
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = await response.json();
  const parsedCart = CartResult.parse(data.cart);

  return parsedCart;
};

// Get a region by ID, including the countries it ships to — used to limit
// the checkout address form's country select to the region's countries.
export const getRegion = async (regionId: string) => {
  const data = await medusaFetch<{ region: unknown }>(
    `/store/regions/${regionId}`,
  );

  return RegionResult.parse(data.region);
};

// Update a cart's contact/shipping/billing details (checkout step 1).
export const updateCart = async (
  cartId: string,
  body: {
    email?: string;
    shipping_address?: Record<string, unknown>;
    billing_address?: Record<string, unknown>;
  },
) => {
  const data = await medusaFetch<{ cart: unknown }>(`/store/carts/${cartId}`, {
    method: "POST",
    params: { fields: CART_FIELDS },
    body,
  });

  return CartResult.parse(data.cart);
};

// List the shipping options available for a cart, with prices calculated
// for that cart's items/destination (checkout step 2).
export const getShippingOptions = async (cartId: string) => {
  const data = await medusaFetch<{ shipping_options: unknown[] }>(
    "/store/shipping-options",
    { params: { cart_id: cartId } },
  );

  return z.array(ShippingOptionResult).parse(data.shipping_options);
};

// Set the cart's shipping method (checkout step 2).
export const addShippingMethod = async (cartId: string, optionId: string) => {
  const data = await medusaFetch<{ cart: unknown }>(
    `/store/carts/${cartId}/shipping-methods`,
    {
      method: "POST",
      params: { fields: CART_FIELDS },
      body: { option_id: optionId },
    },
  );

  return CartResult.parse(data.cart);
};

// Create (or fetch the existing) payment collection for a cart. Medusa
// returns the existing collection if one already exists, so this is safe to
// call every time the payment step mounts (checkout step 3).
export const createPaymentCollection = async (cartId: string) => {
  const data = await medusaFetch<{ payment_collection: unknown }>(
    "/store/payment-collections",
    { method: "POST", body: { cart_id: cartId } },
  );

  return PaymentCollectionResult.parse(data.payment_collection);
};

// Initialize a payment session on a payment collection for the given
// provider (`pp_system_default` or `pp_stripe_stripe`) (checkout step 3).
export const createPaymentSession = async (
  paymentCollectionId: string,
  providerId: string,
  sessionData?: Record<string, unknown>,
) => {
  const data = await medusaFetch<{ payment_collection: unknown }>(
    `/store/payment-collections/${paymentCollectionId}/payment-sessions`,
    { method: "POST", body: { provider_id: providerId, data: sessionData } },
  );

  return PaymentCollectionResult.parse(data.payment_collection);
};

// Discover payment providers after the cart has its final address and region.
// The backend applies per-store routing and returns only verified providers.
export const getPaymentOptions = async (cartId: string) => {
  const data = await medusaFetch<unknown>(
    `/store/carts/${cartId}/payment-options`,
  );

  return PaymentOptionsResult.parse(data);
};

export const confirmPaymentSession = async (
  paymentSessionId: string,
  data: Record<string, unknown> = {},
) => {
  return medusaFetch<{ payment: unknown }>(
    `/store/payment-sessions/${paymentSessionId}/confirm`,
    { method: "POST", body: data },
  );
};

// Complete the cart. On success, Medusa returns `{ type: "order", order }`.
// On a recoverable failure (payment declined/requires action) it responds
// 200 with `{ type: "cart", cart, error }` instead of throwing — anything
// else (out of stock, invalid state, …) throws via `medusaFetch`.
export const completeCart = async (cartId: string) => {
  return medusaFetch<{
    type: "order" | "cart";
    order?: unknown;
    cart?: unknown;
    error?: { message?: string };
  }>(`/store/carts/${cartId}/complete`, { method: "POST" });
};

// Get an order by ID for the confirmation page. Guest orders are readable
// with just the publishable key (no customer auth required).
export const getOrder = async (orderId: string) => {
  const data = await medusaFetch<{ order: unknown }>(
    `/store/orders/${orderId}`,
  );

  return OrderResult.parse(data.order);
};

export const getOrderTracking = async (orderId: string, email: string) => {
  const data = await medusaFetch<unknown>(`/store/orders/${orderId}/tracking`, {
    method: "POST",
    body: { email },
  });
  return OrderTrackingResult.parse(data);
};

// Turn a variant's calculated_price into a plain money value for <Money />.
// Returns undefined if the variant has no price in the configured region.
export const toMoney = (
  calculatedPrice: z.infer<typeof CalculatedPriceResult>,
): z.infer<typeof MoneyResult> | undefined => {
  if (!calculatedPrice || calculatedPrice.calculated_amount === null) {
    return undefined;
  }

  return {
    amount: calculatedPrice.calculated_amount,
    currency_code: calculatedPrice.currency_code || "inr",
  };
};
