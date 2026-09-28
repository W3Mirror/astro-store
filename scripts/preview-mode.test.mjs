import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  PREVIEW_COOKIE,
  PREVIEW_PARAM,
  applyPreviewResponseHeaders,
  findPreviewProductByHandle,
  isPlausiblePreviewToken,
  matchesPreviewFilters,
  mergePreviewPage,
  previewEndpointUrl,
  previewExitHref,
  previewStateOf,
  replacePendingProducts,
  withoutPreviewParam,
} from "../src/utils/preview.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const TOKEN = "spl1.eyJ2IjoxfQ.c2lnbmF0dXJl";

const product = (id, extra = {}) => ({
  id,
  handle: `${id}-handle`,
  title: `Product ${id}`,
  description: null,
  collection_id: null,
  categories: [],
  ...extra,
});

const preview = {
  link: { id: "lnk", expires_at: "2026-10-05T00:00:00.000Z", scope: "store" },
  entries: [
    {
      state: "draft",
      summary: null,
      product: product("draft1", {
        title: "Silk Saree",
        categories: [{ id: "cat_sarees", name: "Sarees" }],
      }),
    },
    {
      state: "pending",
      summary: "title",
      product: product("live2", { title: "Renamed Kurta" }),
    },
  ],
};

test("only builder-shaped tokens are accepted from the URL or cookie", () => {
  assert.equal(isPlausiblePreviewToken(TOKEN), true);
  assert.equal(isPlausiblePreviewToken("exit"), false);
  assert.equal(isPlausiblePreviewToken(""), false);
  assert.equal(isPlausiblePreviewToken(undefined), false);
  assert.equal(isPlausiblePreviewToken("mut1.abc.def"), false);
  assert.equal(isPlausiblePreviewToken(`spl1.${"a".repeat(3000)}.b`), false);
  assert.equal(isPlausiblePreviewToken("spl1.a<b.c"), false);
});

test("the preview endpoint sits next to the configured site-config endpoint", () => {
  assert.equal(
    previewEndpointUrl(
      "https://builder.example/api/public/site-config/abc123?environment=live",
    ),
    "https://builder.example/api/public/storefront-preview/abc123",
  );
  assert.equal(previewEndpointUrl(""), null);
  assert.equal(previewEndpointUrl(undefined), null);
  assert.equal(previewEndpointUrl("not a url"), null);
  assert.equal(previewEndpointUrl("https://builder.example/other/abc"), null);
});

test("preview responses are private, uncached at the CDN, and not indexed", () => {
  const headers = new Headers({
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    "Vercel-CDN-Cache-Control": "public, s-maxage=5",
    "Vercel-Cache-Tag": "store:abc,product",
  });
  applyPreviewResponseHeaders(headers);
  assert.equal(headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(headers.get("Vercel-CDN-Cache-Control"), null);
  assert.equal(headers.get("Vercel-Cache-Tag"), null);
  assert.equal(headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("exit links clear the param; the exit target drops it", () => {
  assert.equal(
    previewExitHref(`https://shop.example/products/a?preview=${TOKEN}&variant=v1`),
    "/products/a?preview=exit&variant=v1",
  );
  assert.equal(
    withoutPreviewParam("https://shop.example/products/a?preview=exit&variant=v1"),
    "/products/a?variant=v1",
  );
});

test("without preview data, pages are returned untouched", () => {
  const page = { products: [product("live1")], count: 1, limit: 10, offset: 0 };
  assert.equal(mergePreviewPage(page, null), page);
  assert.equal(findPreviewProductByHandle(null, "live1-handle"), null);
  assert.equal(previewStateOf(null, "live1"), null);
  const products = [product("live2")];
  assert.equal(replacePendingProducts(products, null), products);
});

test("drafts are added to the first page and staged products replaced in place", () => {
  const page = {
    products: [product("live1"), product("live2", { title: "Kurta" })],
    count: 2,
    limit: 10,
    offset: 0,
  };
  const merged = mergePreviewPage(page, preview, { offset: 0 });
  assert.deepEqual(
    merged.products.map((p) => [p.id, p.title]),
    [
      ["draft1", "Silk Saree"],
      ["live1", "Product live1"],
      ["live2", "Renamed Kurta"],
    ],
  );
  assert.equal(merged.count, 3);
  assert.equal(merged.limit, 10);

  const secondPage = mergePreviewPage(page, preview, { offset: 10 });
  assert.equal(secondPage.products[0].id, "live1");
  assert.equal(secondPage.count, 2);
});

test("drafts only appear where the Store API filters would have put them", () => {
  const draft = preview.entries[0].product;
  assert.equal(matchesPreviewFilters(draft, { q: "silk" }), true);
  assert.equal(matchesPreviewFilters(draft, { q: "cotton" }), false);
  assert.equal(matchesPreviewFilters(draft, { categoryId: "cat_sarees" }), true);
  assert.equal(
    matchesPreviewFilters(draft, { categoryId: ["cat_x", "cat_sarees"] }),
    true,
  );
  assert.equal(matchesPreviewFilters(draft, { categoryId: "cat_x" }), false);
  assert.equal(matchesPreviewFilters(draft, { collectionId: "pcol_1" }), false);

  const page = { products: [], count: 0 };
  const search = mergePreviewPage(page, preview, { q: "cotton" });
  assert.equal(search.products.length, 0);
});

test("product pages resolve drafts by handle and report each state", () => {
  assert.equal(
    findPreviewProductByHandle(preview, "draft1-handle")?.title,
    "Silk Saree",
  );
  assert.equal(findPreviewProductByHandle(preview, "unknown"), null);
  assert.equal(previewStateOf(preview, "draft1"), "draft");
  assert.equal(previewStateOf(preview, "live2"), "pending");
  assert.equal(previewStateOf(preview, "live1"), null);
});

test("middleware starts, persists, ends, and un-caches preview", async () => {
  const source = await read("src/middleware.ts");
  assert.match(source, /searchParams\.get\(PREVIEW_PARAM\)/);
  assert.match(source, /cookies\.set\(PREVIEW_COOKIE/);
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: "lax"/);
  // A session cookie: no maxAge/expires.
  assert.doesNotMatch(source, /maxAge|expires:/);
  assert.match(source, /cookies\.delete\(PREVIEW_COOKIE/);
  assert.match(source, /applyPreviewResponseHeaders\(response\.headers\)/);
  // Test-twin robots header is kept.
  assert.match(source, /storeEnvironment === "test"/);
  assert.equal(PREVIEW_PARAM, "preview");
  assert.equal(PREVIEW_COOKIE, "store_preview");
});

test("preview data comes from the builder endpoint, never the Store API", async () => {
  const context = await read("src/utils/preview-context.ts");
  assert.match(context, /previewEndpointUrl\(config\.siteConfigUrl\)/);
  assert.match(context, /Authorization: `Bearer \$\{token\}`/);
  assert.match(context, /cache: "no-store"/);
  // Preview products go through the same schema live products do.
  assert.match(context, /product: ProductResult/);
  const medusa = await read("src/utils/medusa.ts");
  assert.doesNotMatch(medusa, /status.*draft/);
});

test("every page shows the preview banner with an exit link and noindex", async () => {
  const [layout, banner] = await Promise.all([
    read("src/layouts/BaseLayout.astro"),
    read("src/components/PreviewBanner.astro"),
  ]);
  assert.match(layout, /<PreviewBanner \/>/);
  assert.match(layout, /Astro\.locals\.preview \|\|/);
  assert.match(layout, /"noindex, nofollow"/);
  assert.match(banner, /role="status"/);
  assert.match(banner, /Exit preview/);
  assert.match(banner, /previewExitHref/);
  assert.match(banner, /expired or was\s+turned off/);
});

test("caching is never requested for a preview request", async () => {
  const cache = await read("src/utils/cache.ts");
  assert.match(cache, /if \(Astro\.locals\.preview\)/);
  assert.match(cache, /private, no-store/);
});

test("drafts can't be added to the bag; staged prices are never charged", async () => {
  const [pdp, picker, form, notice, card] = await Promise.all([
    read("src/pages/products/[...handle].astro"),
    read("src/components/ProductVariantPicker.svelte"),
    read("src/components/AddToCartForm.svelte"),
    read("src/components/PreviewProductNotice.astro"),
    read("src/components/ProductCard.astro"),
  ]);
  assert.match(pdp, /purchaseBlocked=\{previewState === "draft"\}/);
  assert.match(
    pdp,
    /<PreviewProductNotice state=\{previewState\} unlisted=\{unlisted\} \/>/,
  );
  assert.match(picker, /disabled=\{purchaseBlocked \|\|/);
  assert.match(picker, /if \(purchaseBlocked \|\|/);
  assert.match(form, /disabled=\{purchaseBlocked \|\|/);
  assert.match(form, /if \(purchaseBlocked\) return;/);
  assert.match(form, /Not available in preview/);
  assert.match(notice, /Draft/);
  assert.match(notice, /Pending changes/);
  assert.match(notice, /current live\s+price/);
  assert.match(notice, /Unlisted/);
  assert.match(card, /"Draft" : "Pending changes"/);
});

test("the sitemap and llms.txt never pass preview data", async () => {
  const [sitemap, llms] = await Promise.all([
    read("src/pages/sitemap.xml.ts"),
    read("src/pages/llms.txt.ts"),
  ]);
  for (const source of [sitemap, llms]) {
    assert.doesNotMatch(source, /preview/i);
  }
});
