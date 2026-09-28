// @ts-check
// Storefront PREVIEW mode — pure helpers (plain JS so the node:test suite
// in `scripts/preview-mode.test.mjs` can run them directly).
//
// A preview link is the storefront URL plus `?preview=<token>`. The token
// is minted and verified by the store builder; this template never holds a
// secret and never trusts the token itself — it only forwards it, from the
// server, to the builder's preview endpoint (`previewEndpointUrl`), which
// answers with the store's draft products and its products with staged
// changes (already in this template's product shape). The live Store API is
// never asked for drafts.
//
// Preview must never leak into normal responses or caches: every preview
// response is `private, no-store` with no CDN directives (see
// `applyPreviewResponseHeaders`), and preview data is only ever merged into
// a page when the request itself carries a preview token.

export const PREVIEW_PARAM = "preview";
export const PREVIEW_COOKIE = "store_preview";
export const PREVIEW_EXIT_VALUE = "exit";

/** A token as the builder mints it: `spl1.<payload>.<signature>`. */
/**
 * @param {unknown} value
 * @returns {value is string}
 */
export const isPlausiblePreviewToken = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 2048 &&
  /^spl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

// The builder's preview endpoint lives next to the public site-config
// endpoint this storefront is already configured with
// (`PUBLIC_SITE_CONFIG_URL` = `<builder>/api/public/site-config/<storeId>`),
// so preview needs no extra configuration. `null` when unset/malformed —
// preview mode is then unavailable (the page renders live, never errors).
/**
 * @param {string | undefined} siteConfigUrl
 * @returns {string | null}
 */
export const previewEndpointUrl = (siteConfigUrl) => {
  if (!siteConfigUrl) return null;
  try {
    const url = new URL(siteConfigUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const storeId = segments.at(-1);
    if (!storeId || segments.at(-2) !== "site-config") return null;
    return `${url.origin}/api/public/storefront-preview/${encodeURIComponent(storeId)}`;
  } catch {
    return null;
  }
};

/** The request URL without its `preview` param (the banner's exit target). */
/** @param {string} href */
export const withoutPreviewParam = (href) => {
  const url = new URL(href);
  url.searchParams.delete(PREVIEW_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};

/** The exit link: clears the preview cookie, then lands on the live page. */
/** @param {string} href */
export const previewExitHref = (href) => {
  const url = new URL(href);
  url.searchParams.set(PREVIEW_PARAM, PREVIEW_EXIT_VALUE);
  return `${url.pathname}${url.search}`;
};

// Preview responses are personal and short-lived: never stored by the
// browser, never cached by Vercel's CDN, never indexed.
/** @param {Headers} headers */
export const applyPreviewResponseHeaders = (headers) => {
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.delete("Vercel-CDN-Cache-Control");
  headers.delete("CDN-Cache-Control");
  headers.delete("Vercel-Cache-Tag");
  headers.set("X-Robots-Tag", "noindex, nofollow");
};

/** @param {unknown} value */
const normalized = (value) =>
  typeof value === "string" ? value.toLowerCase() : "";

// Mirrors what the Store API's own filters would do for a draft: the
// free-text `q` (title/description/handle), category ids (any-of), and the
// legacy collection id.
/**
 * @param {PreviewableProduct} product
 * @param {{ q?: string, categoryId?: string | string[], collectionId?: string }} [filters]
 */
export const matchesPreviewFilters = (product, filters = {}) => {
  const q = normalized(filters.q?.trim());
  if (
    q &&
    ![product.title, product.description, product.handle].some((field) =>
      normalized(field).includes(q),
    )
  ) {
    return false;
  }
  const categoryIds = [filters.categoryId]
    .flat()
    .filter((id) => typeof id === "string" && id.length > 0);
  if (
    categoryIds.length > 0 &&
    !(product.categories ?? []).some((category) =>
      categoryIds.includes(category.id),
    )
  ) {
    return false;
  }
  if (filters.collectionId && product.collection_id !== filters.collectionId) {
    return false;
  }
  return true;
};

/**
 * @typedef {{ id: string, handle: string, title: string, description?: string | null, collection_id?: string | null, categories?: { id: string }[] }} PreviewableProduct
 * @typedef {{ state: "draft" | "pending", product: PreviewableProduct }} PreviewEntry
 * @typedef {{ entries: PreviewEntry[] }} PreviewLike
 */

/**
 * Every live product that has staged changes is swapped for its preview.
 * @template {PreviewableProduct | null} T
 * @param {T[]} products
 * @param {PreviewLike | null} preview
 * @returns {T[]}
 */
export const replacePendingProducts = (products, preview) => {
  if (!preview) return products;
  const byId = new Map(preview.entries.map((entry) => [entry.product.id, entry]));
  return products.map((product) =>
    product && byId.has(product.id)
      ? /** @type {T} */ (/** @type {PreviewEntry} */ (byId.get(product.id)).product)
      : product,
  );
};

// A live product page merged with the preview: products with staged changes
// are replaced in place, and DRAFT products matching the page's filters are
// added in front — on the first page only, so paging never repeats them.
/**
 * @template {PreviewableProduct | null} T
 * @template {{ products: T[], count: number }} P
 * @param {P} page
 * @param {PreviewLike | null} preview
 * @param {{ q?: string, categoryId?: string | string[], collectionId?: string, offset?: number }} [filters]
 * @returns {P}
 */
export const mergePreviewPage = (page, preview, filters = {}) => {
  if (!preview) return page;
  const products = replacePendingProducts(page.products, preview);
  const liveIds = new Set(products.map((product) => product?.id));
  const drafts =
    (filters.offset ?? 0) > 0
      ? []
      : preview.entries
          .filter(
            (entry) =>
              entry.state === "draft" &&
              !liveIds.has(entry.product.id) &&
              matchesPreviewFilters(entry.product, filters),
          )
          .map((entry) => /** @type {T} */ (entry.product));
  return {
    ...page,
    products: [...drafts, ...products],
    count: page.count + drafts.length,
  };
};

/**
 * The preview version of the product at `handle`, if the preview has one.
 * @template {PreviewEntry} E
 * @param {{ entries: E[] } | null} preview
 * @param {string} handle
 * @returns {E["product"] | null}
 */
export const findPreviewProductByHandle = (preview, handle) =>
  preview?.entries.find((entry) => entry.product.handle === handle)?.product ??
  null;

/**
 * `"draft"`, `"pending"`, or `null` for a product the preview doesn't touch.
 * @param {PreviewLike | null} preview
 * @param {string | undefined} productId
 * @returns {"draft" | "pending" | null}
 */
export const previewStateOf = (preview, productId) =>
  preview?.entries.find((entry) => entry.product.id === productId)?.state ??
  null;
