// @ts-check
// Product VISIBILITY — pure helpers (plain JS so the node:test suite in
// `scripts/unlisted-products.test.mjs` can run them directly).
//
// A published product is LISTED (the default) or UNLISTED. An unlisted
// product is reachable, and purchasable, only at its product URL: it never
// appears in product listings, search, collections, the homepage,
// recommendations, the sitemap or llms.txt, and its page is `noindex`.
//
// The store builder records it as `product.metadata.visibility =
// "unlisted"` and keeps a per-store LISTING sales channel that holds only
// listed products, with its own publishable key (`listingPublishableKey` in
// the site config). Every LIST read goes through that key, so the Store API
// itself leaves unlisted products out — with correct counts and pagination.
// The product page, cart and checkout keep using the storefront's own key,
// which still sees every published product.
//
// `withoutUnlisted` is the belt-and-braces filter for the moments that key
// is unavailable (the site config is unreachable, or the key read fails):
// the page then drops unlisted products itself, so they never show up in a
// listing even though that page's count may be slightly high.

/**
 * @typedef {{ metadata?: Record<string, unknown> | null } | null | undefined} WithMetadata
 */

/**
 * @param {WithMetadata} product
 * @returns {boolean}
 */
export const isUnlisted = (product) =>
  product?.metadata?.visibility === "unlisted";

/**
 * A product page without unlisted products; `count` shrinks by the number
 * removed (exact for this page, an estimate for the whole listing).
 * @template {WithMetadata} T
 * @template {{ products: T[], count: number }} P
 * @param {P} page
 * @returns {P}
 */
export const withoutUnlisted = (page) => {
  const products = page.products.filter((product) => !isUnlisted(product));
  const removed = page.products.length - products.length;
  if (removed === 0) return page;
  return { ...page, products, count: Math.max(0, page.count - removed) };
};

/**
 * The publishable key LIST reads use: the listing key when the store has
 * one, else the storefront's own key.
 * @param {string | null | undefined} listingKey
 * @param {string} storefrontKey
 * @returns {string}
 */
export const listingKeyOr = (listingKey, storefrontKey) =>
  typeof listingKey === "string" && listingKey.length > 0
    ? listingKey
    : storefrontKey;

/**
 * Robots directive for a product page: unlisted products are never indexed
 * (followed links still work, like Shopify's unlisted products).
 * @param {WithMetadata} product
 * @returns {string | null}
 */
export const productRobots = (product) =>
  isUnlisted(product) ? "noindex, follow" : null;
