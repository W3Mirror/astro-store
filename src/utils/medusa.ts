import { z } from "zod";
import {
  CalculatedPriceResult,
  CartResult,
  MoneyResult,
  ProductResult,
} from "./schemas";
import { config } from "./config";

// Fields requested on top of Medusa's defaults for /store/products so we get
// calculated prices (needs `region_id`), inventory and variant options.
// `+` adds to the default field set, `*` expands a relation.
const PRODUCT_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,+variants.allow_backorder,+variants.manage_inventory,*variants.options,+options,+images";

// Cart line items don't include per-item totals by default, only the unit
// price — request them explicitly.
const CART_FIELDS = "+items.total,+items.subtotal";

const buildUrl = (path: string, params: Record<string, unknown> = {}) => {
  const url = new URL(path, config.medusaBackendUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};

// Make a request to Medusa's Store REST API, adding the publishable API key
// header required on every /store/* request.
const medusaFetch = async <T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
  } = {}
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
    const responseBody = await response.text();
    throw new Error(`${response.status} ${responseBody}`);
  }

  return response.json();
};

// Get all products or a limited number of products (default: 10)
export const getProducts = async (options: { limit?: number } = {}) => {
  const { limit = 10 } = options;

  const data = await medusaFetch<{ products: unknown[] }>("/store/products", {
    params: {
      limit,
      region_id: config.medusaRegionId,
      fields: PRODUCT_FIELDS,
    },
  });

  const ProductsResult = z.array(ProductResult);
  const parsedProducts = ProductsResult.parse(data.products);

  return parsedProducts;
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

// Medusa's Store API has no dedicated recommendations endpoint, so we fall
// back to other products in the same collection.
export const getProductRecommendations = async (options: {
  productId: string;
  collectionId?: string | null;
  limit?: number;
}) => {
  const { productId, collectionId, limit = 4 } = options;

  if (!collectionId) {
    return [];
  }

  const data = await medusaFetch<{ products: unknown[] }>("/store/products", {
    params: {
      collection_id: collectionId,
      region_id: config.medusaRegionId,
      limit: limit + 1,
      fields: PRODUCT_FIELDS,
    },
  });

  const ProductsResult = z.array(ProductResult);
  const parsedProducts = ProductsResult.parse(data.products).filter(
    (product) => product?.id !== productId
  );

  return parsedProducts.slice(0, limit);
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
  quantity: number
) => {
  const data = await medusaFetch<{ cart: unknown }>(
    `/store/carts/${cartId}/line-items`,
    {
      method: "POST",
      params: { fields: CART_FIELDS },
      body: { variant_id: variantId, quantity },
    }
  );

  const parsedCart = CartResult.parse(data.cart);

  return parsedCart;
};

// Remove a line item from an existing cart (by ID) and return the updated cart object
export const removeCartLineItem = async (cartId: string, lineId: string) => {
  const data = await medusaFetch<{ parent: unknown }>(
    `/store/carts/${cartId}/line-items/${lineId}`,
    {
      method: "DELETE",
      params: { fields: CART_FIELDS },
    }
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
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`${response.status} ${responseBody}`);
  }

  const data = await response.json();
  const parsedCart = CartResult.parse(data.cart);

  return parsedCart;
};

// Turn a variant's calculated_price into a plain money value for <Money />.
// Returns undefined if the variant has no price in the configured region.
export const toMoney = (
  calculatedPrice: z.infer<typeof CalculatedPriceResult>
): z.infer<typeof MoneyResult> | undefined => {
  if (!calculatedPrice || calculatedPrice.calculated_amount === null) {
    return undefined;
  }

  return {
    amount: calculatedPrice.calculated_amount,
    currency_code: calculatedPrice.currency_code || "inr",
  };
};
