import type { z } from "zod";
import type { ProductResult } from "./schemas";
import { getVariantAvailability } from "./variant-selection";

type Product = NonNullable<z.infer<typeof ProductResult>>;

// --- Server-side vs. client-side filtering ---------------------------------
//
// The Store API (`GET /store/products`) supports `category_id` (the
// "Collection" facet — ORs across several ids) natively, so that facet is
// always applied server-side, at full catalog scale, via `getProductPage`'s
// existing `categoryId` option — see `medusa.ts`.
//
// It has no query param for price at all, and its `variants.options` filter
// only expresses a single option/value pair per request (no clean way to
// AND across several option *axes* while ORing within each axis — the shape
// a Fabric+Size+Colour facet needs). So Availability, Price, and every
// option-value facet (Fabric/Type/Size/Colour/...) are applied here,
// client-side, over a bounded pool of products fetched from the already-
// scoped (search/collection) query.
//
// LIMITATION: a store with more products (matching the base search/
// collection scope) than `FILTER_FETCH_CAP` will only see facets derived
// from, and filtering applied to, the first `FILTER_FETCH_CAP` of them
// (server-sorted by the page's chosen order beforehand). Pagination over the
// filtered result is exact (not estimated) since the whole bounded pool is
// in memory. Raise the cap if a store's catalog outgrows it; the Store API
// itself supports fetching up to `PRODUCT_PAGE_MAX_LIMIT` (500) in one call.
export const FILTER_FETCH_CAP = 200;

export const OPTION_PARAM_PREFIX = "opt_";

// Turns a merchant's option title (e.g. "Fabric", "Colour", "Neck Type")
// into a URL-safe, generic query-param key. Never hardcodes a store-specific
// option name — any option title round-trips through this the same way.
export const slugifyOptionTitle = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");

const parseCsv = (value: string | null): string[] =>
  value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

const MAX_FACET_VALUES = 50;
const MAX_COLLECTION_IDS = 50;

const parseNonNegativeNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export interface ProductFacetFilters {
  inStockOnly: boolean;
  priceMin?: number;
  priceMax?: number;
  // Only meaningful on `/products` — `/collections/<handle>` is already
  // scoped to one category via the route itself (see that page's doc
  // comment on why `?category_id=` is ignored there).
  collectionIds: string[];
  // Keyed by the slugified option title (`slugifyOptionTitle`), e.g.
  // `{ fabric: ["Cotton", "Silk"], size: ["M"] }`.
  optionFilters: Record<string, string[]>;
}

// A facet's checkbox inputs share one `name` (e.g. several `name=
// "collections"` boxes, or several `name="opt_fabric"` boxes), so a real
// `<form method="get">` submission sends REPEATED same-key params
// (`collections=a&collections=b`), not one comma-joined value. A
// hand-built chip-removal/pagination href (see `serializeProductFacetFilters`)
// instead sends one comma-joined value per key. Support both shapes:
// gather every occurrence of the key, then split each on commas too.
const parseMultiParam = (params: URLSearchParams, key: string): string[] =>
  params.getAll(key).flatMap((raw) => parseCsv(raw));

export const parseProductFacetFilters = (
  params: URLSearchParams,
): ProductFacetFilters => {
  const axisKeys = new Set<string>();
  for (const key of params.keys()) {
    if (key.startsWith(OPTION_PARAM_PREFIX)) {
      axisKeys.add(key.slice(OPTION_PARAM_PREFIX.length));
    }
  }

  const optionFilters: Record<string, string[]> = {};
  for (const axisKey of axisKeys) {
    if (!axisKey) continue;
    const values = parseMultiParam(
      params,
      `${OPTION_PARAM_PREFIX}${axisKey}`,
    ).slice(0, MAX_FACET_VALUES);
    if (values.length > 0) optionFilters[axisKey] = values;
  }

  return {
    inStockOnly: params.get("in_stock") === "1",
    priceMin: parseNonNegativeNumber(params.get("price_min")),
    priceMax: parseNonNegativeNumber(params.get("price_max")),
    collectionIds: parseMultiParam(params, "collections").slice(
      0,
      MAX_COLLECTION_IDS,
    ),
    optionFilters,
  };
};

export const EMPTY_FACET_FILTERS: ProductFacetFilters = {
  inStockOnly: false,
  collectionIds: [],
  optionFilters: {},
};

export const withoutAvailability = (
  filters: ProductFacetFilters,
): ProductFacetFilters => ({ ...filters, inStockOnly: false });

export const withoutPrice = (
  filters: ProductFacetFilters,
): ProductFacetFilters => ({
  ...filters,
  priceMin: undefined,
  priceMax: undefined,
});

export const withoutCollectionId = (
  filters: ProductFacetFilters,
  id: string,
): ProductFacetFilters => ({
  ...filters,
  collectionIds: filters.collectionIds.filter(
    (collectionId) => collectionId !== id,
  ),
});

export const withoutOptionValue = (
  filters: ProductFacetFilters,
  axisKey: string,
  value: string,
): ProductFacetFilters => {
  const remaining = (filters.optionFilters[axisKey] ?? []).filter(
    (existing) => existing !== value,
  );
  const optionFilters = { ...filters.optionFilters };
  if (remaining.length > 0) {
    optionFilters[axisKey] = remaining;
  } else {
    delete optionFilters[axisKey];
  }
  return { ...filters, optionFilters };
};

export interface ListingHrefState {
  q?: string;
  order: string;
  limit: number;
  offset?: number;
  facets: ProductFacetFilters;
  // Extra, non-facet params every generated href must carry through
  // unchanged — the legacy `collection_id`/`category_id` deep-link params a
  // listing page may have been opened with (see `product-query.ts`'s
  // `ProductQuery`). These are opaque catalog IDs, never a shopper-facing
  // filter control (that's what the "Collection" facet, keyed by
  // `collections`, is for) — only ever round-tripped, never rendered as a
  // choice.
  stickyParams?: Record<string, string | undefined>;
}

// Builds a full listing href (pagination links, sort links, chip removal,
// "Clear all") from the pieces every `/products`/`/collections/<handle>`
// listing page already tracks. `basePath` carries any route-level scoping
// (e.g. `/collections/monsoon-edit`) the caller owns.
export const buildListingHref = (
  basePath: string,
  state: ListingHrefState,
): string => {
  const params = serializeProductFacetFilters(state.facets);
  if (state.q) params.set("q", state.q);
  if (state.order && state.order !== "-created_at") {
    params.set("order", state.order);
  }
  params.set("limit", String(state.limit));
  if (state.offset) params.set("offset", String(state.offset));
  for (const [key, value] of Object.entries(state.stickyParams ?? {})) {
    if (value) params.set(key, value);
  }
  return `${basePath}?${params.toString()}`;
};

// A price-based sort can't be requested from the Store API (calculated
// price isn't a sortable field there), so it's applied client-side, which
// requires the same bounded-pool fetch as the other facets.
export const isClientSideSort = (order: string): boolean =>
  order === "price-asc" || order === "price-desc";

export const needsClientSideFiltering = (
  filters: ProductFacetFilters,
  order: string,
): boolean =>
  filters.inStockOnly ||
  filters.priceMin !== undefined ||
  filters.priceMax !== undefined ||
  filters.collectionIds.length > 0 ||
  Object.keys(filters.optionFilters).length > 0 ||
  isClientSideSort(order);

// Re-serializes facet filters back into query params (used to build the
// "keep everything else" hrefs for chip removal, pagination, and sort
// links). Deliberately excludes `q`/`order`/`limit`/`offset`/route scoping —
// callers own merging those in since they vary per listing page.
export const serializeProductFacetFilters = (
  filters: ProductFacetFilters,
): URLSearchParams => {
  const params = new URLSearchParams();
  if (filters.inStockOnly) params.set("in_stock", "1");
  if (filters.priceMin !== undefined) {
    params.set("price_min", String(filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    params.set("price_max", String(filters.priceMax));
  }
  if (filters.collectionIds.length > 0) {
    params.set("collections", filters.collectionIds.join(","));
  }
  for (const [axisKey, values] of Object.entries(filters.optionFilters)) {
    if (values.length > 0) {
      params.set(`${OPTION_PARAM_PREFIX}${axisKey}`, values.join(","));
    }
  }
  return params;
};

export const minVariantPrice = (product: Product): number | undefined => {
  const amounts = product.variants
    .map((variant) => variant.calculated_price?.calculated_amount)
    .filter((amount): amount is number => typeof amount === "number");
  return amounts.length > 0 ? Math.min(...amounts) : undefined;
};

export const isProductInStock = (product: Product): boolean =>
  product.variants.some(
    (variant) => getVariantAvailability(variant).availableForSale,
  );

const productHasOptionValue = (
  product: Product,
  axisKey: string,
  values: string[],
): boolean =>
  product.options.some(
    (option) =>
      slugifyOptionTitle(option.title) === axisKey &&
      option.values.some((value) => values.includes(value.value)),
  );

// Applies every active facet filter to a candidate pool (AND across facets,
// OR within a facet's selected values). See the module doc for why this
// runs client-side and what "candidate pool" means.
export const applyProductFacetFilters = (
  products: Product[],
  filters: ProductFacetFilters,
): Product[] =>
  products.filter((product) => {
    if (filters.inStockOnly && !isProductInStock(product)) return false;

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      const price = minVariantPrice(product);
      if (price === undefined) return false;
      if (filters.priceMin !== undefined && price < filters.priceMin) {
        return false;
      }
      if (filters.priceMax !== undefined && price > filters.priceMax) {
        return false;
      }
    }

    for (const [axisKey, values] of Object.entries(filters.optionFilters)) {
      if (!productHasOptionValue(product, axisKey, values)) return false;
    }

    return true;
  });

// Sorts by the two price orders this template adds on top of the Store
// API's own sortable fields; any other `order` value is returned unchanged
// (the pool is already server-sorted by that order).
export const sortProducts = (
  products: Product[],
  order: string,
): Product[] => {
  if (!isClientSideSort(order)) return products;

  const decorated = products.map((product) => ({
    product,
    price: minVariantPrice(product) ?? Number.POSITIVE_INFINITY,
  }));
  decorated.sort((a, b) =>
    order === "price-asc" ? a.price - b.price : b.price - a.price,
  );
  return decorated.map((entry) => entry.product);
};

export interface OptionFacetValue {
  value: string;
  count: number;
}

export interface OptionFacet {
  axisKey: string;
  title: string;
  values: OptionFacetValue[];
}

// Derives the available option-value facets (Fabric, Type, Size, Colour, or
// whatever a store's products actually declare — never a hardcoded list)
// from a candidate pool, grouping same-named options together
// case-insensitively (each product's option is its own entity in Medusa,
// even when two products both call one "Fabric").
export const deriveOptionFacets = (products: Product[]): OptionFacet[] => {
  const axes = new Map<string, { title: string; counts: Map<string, number> }>();

  for (const product of products) {
    for (const option of product.options) {
      const axisKey = slugifyOptionTitle(option.title);
      if (!axisKey) continue;

      if (!axes.has(axisKey)) {
        axes.set(axisKey, { title: option.title, counts: new Map() });
      }
      const axis = axes.get(axisKey)!;

      // Count each value at most once per product, even if it appeared
      // more than once in `option.values` (shouldn't happen, but a count
      // must never exceed the pool size).
      const uniqueValues = new Set(option.values.map((value) => value.value));
      for (const value of uniqueValues) {
        axis.counts.set(value, (axis.counts.get(value) ?? 0) + 1);
      }
    }
  }

  return [...axes.entries()].map(([axisKey, { title, counts }]) => ({
    axisKey,
    title,
    values: [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value)),
  }));
};

export interface PriceBounds {
  min: number;
  max: number;
}

export const derivePriceBounds = (
  products: Product[],
): PriceBounds | undefined => {
  const prices = products
    .map(minVariantPrice)
    .filter((price): price is number => price !== undefined);
  if (prices.length === 0) return undefined;
  return { min: Math.min(...prices), max: Math.max(...prices) };
};

export const deriveAvailabilityCounts = (
  products: Product[],
): { inStock: number; total: number } => ({
  inStock: products.filter(isProductInStock).length,
  total: products.length,
});
