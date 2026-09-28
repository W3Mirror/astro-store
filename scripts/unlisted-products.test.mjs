import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";
import { mergePreviewPage } from "../src/utils/preview.js";
import {
  isUnlisted,
  listingKeyOr,
  productRobots,
  withoutUnlisted,
} from "../src/utils/visibility.js";

// UNLISTED products (see `src/utils/visibility.js`): reachable and
// purchasable at their product URL, never in a listing, and noindex.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const SITE_CONFIG_URL = "https://builder.example/api/public/site-config/p1";

const serverFor = (siteConfigUrl) =>
  createServer({
    root,
    appType: "custom",
    logLevel: "silent",
    define: {
      "import.meta.env.PUBLIC_MEDUSA_BACKEND_URL": JSON.stringify(
        "https://backend.example",
      ),
      "import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY":
        JSON.stringify("pk_store"),
      "import.meta.env.PUBLIC_MEDUSA_REGION_ID": JSON.stringify("reg_test"),
      "import.meta.env.PUBLIC_STORE_NAME": JSON.stringify("Test Store"),
      "import.meta.env.PUBLIC_ANNOUNCEMENT_MESSAGE": JSON.stringify(""),
      "import.meta.env.PUBLIC_SITE_CONFIG_URL": JSON.stringify(siteConfigUrl),
      "import.meta.env.PUBLIC_CUSTOMER_ENGAGEMENT_ENABLED":
        JSON.stringify("false"),
      "import.meta.env.PUBLIC_RECOMMENDATIONS_ENABLED": JSON.stringify("true"),
    },
  });

const product = (id, metadata = null) => ({
  id,
  title: `Product ${id}`,
  handle: `${id}-handle`,
  metadata,
  variants: [],
});

const LISTED = product("listed1");
const LISTED_2 = product("listed2", { visibility: "listed" });
const UNLISTED = product("hidden1", { visibility: "unlisted" });

// A fake commerce backend: the storefront key sees every published product;
// the listing key sees only listed ones (that's what the listing sales
// channel holds). Records every request with the key it used.
const fakeBackend = ({ listingKey = "pk_listing", listingFails = false } = {}) => {
  const requests = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href.startsWith(SITE_CONFIG_URL)) {
      return Response.json({ storeName: "Test Store", listingPublishableKey: listingKey });
    }
    const key = init.headers?.["x-publishable-api-key"];
    requests.push({ path: url.pathname, key, params: url.searchParams });
    if (key === "pk_listing" && listingFails) {
      return new Response("Publishable key needs to have a sales channel configured", { status: 400 });
    }
    const visible = key === "pk_listing" ? [LISTED, LISTED_2] : [LISTED, UNLISTED, LISTED_2];
    if (url.pathname === "/store/products") {
      const handle = url.searchParams.get("handle");
      const ids = url.searchParams.getAll("id");
      const matching = visible.filter(
        (item) =>
          (!handle || item.handle === handle) &&
          (ids.length === 0 || ids.includes(item.id)),
      );
      return Response.json({
        products: matching,
        count: matching.length,
        offset: 0,
        limit: 50,
      });
    }
    if (url.pathname === "/store/recommendations") {
      return Response.json({
        recommendations: [LISTED, UNLISTED].map((item) => ({
          product: { id: item.id, title: item.title, handle: item.handle },
          score: 1,
          reasons: ["Bought together"],
        })),
        algorithm: "deterministic-v1",
        signal_window_limit: 100,
      });
    }
    throw new Error(`unexpected request ${url.href}`);
  };
  return { requests, fetch };
};

const withFetch = async (fetch, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

test("pure helpers", () => {
  assert.equal(isUnlisted(UNLISTED), true);
  assert.equal(isUnlisted(LISTED), false);
  assert.equal(isUnlisted(LISTED_2), false);
  assert.equal(isUnlisted(null), false);
  assert.equal(listingKeyOr("pk_listing", "pk_store"), "pk_listing");
  assert.equal(listingKeyOr(null, "pk_store"), "pk_store");
  assert.equal(listingKeyOr("", "pk_store"), "pk_store");
  assert.equal(productRobots(UNLISTED), "noindex, follow");
  assert.equal(productRobots(LISTED), null);
  const page = { products: [LISTED, UNLISTED, LISTED_2], count: 3 };
  assert.deepEqual(withoutUnlisted(page), {
    products: [LISTED, LISTED_2],
    count: 2,
  });
  const clean = { products: [LISTED], count: 7 };
  assert.equal(withoutUnlisted(clean), clean);
});

test("preview listings leave unlisted drafts out, as the live site will", () => {
  const draft = (item) => ({ state: "draft", summary: null, product: { ...item, collection_id: null, categories: [], description: null } });
  const merged = mergePreviewPage(
    { products: [LISTED], count: 1 },
    { entries: [draft(product("d1")), draft(product("d2", { visibility: "unlisted" }))] },
  );
  assert.deepEqual(
    merged.products.map((item) => item.id),
    ["d1", "listed1"],
  );
  assert.equal(merged.count, 2);
});

test("listings, search, collections and recommendations read through the listing key", async (t) => {
  const server = await serverFor(SITE_CONFIG_URL);
  t.after(() => server.close());
  const medusa = await server.ssrLoadModule(
    fileURLToPath(new URL("../src/utils/medusa.ts", import.meta.url)),
  );
  const backend = fakeBackend();
  await withFetch(backend.fetch, async () => {
    const page = await medusa.getProductPage({ q: "kurta", categoryId: "cat_1" });
    assert.deepEqual(page.products.map((item) => item.id), ["listed1", "listed2"]);
    assert.equal(page.count, 2);
    const list = backend.requests.find((request) => request.params.get("q") === "kurta");
    assert.equal(list.key, "pk_listing");
    assert.equal(list.params.get("category_id"), "cat_1");

    const homepage = await medusa.getProducts({ limit: 500 });
    assert.deepEqual(homepage.map((item) => item.id), ["listed1", "listed2"]);

    const related = await medusa.getProductRecommendations({
      productId: "listed1",
      categoryId: "cat_1",
    });
    assert.deepEqual(related.map((item) => item.id), ["listed2"]);

    const ranked = await medusa.getStoreRecommendations({ anchorProductIds: ["x"] });
    assert.deepEqual(ranked.map((entry) => entry.product.id), ["listed1"]);
    const recs = backend.requests.find((request) => request.path === "/store/recommendations");
    assert.equal(recs.key, "pk_store");

    // The product page uses the storefront's own key: an unlisted product
    // is still reachable (and so purchasable) at its URL.
    const pdp = await medusa.getProductByHandle({ handle: "hidden1-handle" });
    assert.equal(pdp.id, "hidden1");
    assert.equal(isUnlisted(pdp), true);
    const pdpRequest = backend.requests.find((request) => request.params.get("handle") === "hidden1-handle");
    assert.equal(pdpRequest.key, "pk_store");
  });
});

test("a failing listing read falls back to the storefront key and still hides unlisted products", async (t) => {
  const server = await serverFor(SITE_CONFIG_URL);
  t.after(() => server.close());
  const medusa = await server.ssrLoadModule(
    fileURLToPath(new URL("../src/utils/medusa.ts", import.meta.url)),
  );
  const backend = fakeBackend({ listingFails: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    await withFetch(backend.fetch, async () => {
      const page = await medusa.getProductPage({});
      assert.deepEqual(page.products.map((item) => item.id), ["listed1", "listed2"]);
      assert.equal(page.count, 2);
      assert.deepEqual(
        backend.requests.filter((request) => request.path === "/store/products").map((request) => request.key),
        ["pk_listing", "pk_store"],
      );
    });
  } finally {
    console.error = originalError;
  }
});

test("a store without a listing key lists through its own key (nothing to hide)", async (t) => {
  const server = await serverFor("");
  t.after(() => server.close());
  const medusa = await server.ssrLoadModule(
    fileURLToPath(new URL("../src/utils/medusa.ts", import.meta.url)),
  );
  const backend = fakeBackend();
  await withFetch(backend.fetch, async () => {
    const page = await medusa.getProductPage({});
    assert.deepEqual(page.products.map((item) => item.id), ["listed1", "listed2"]);
    assert.deepEqual(
      backend.requests.map((request) => request.key),
      ["pk_store"],
    );
  });
});

test("contracts: cart stays on the storefront key; PDP is noindex when unlisted", async () => {
  const medusa = await read("src/utils/medusa.ts");
  const createCart = medusa.slice(medusa.indexOf("export const createCart"));
  assert.doesNotMatch(createCart.slice(0, 600), /catalogFetch|publishableKey/);
  const byHandle = medusa.slice(
    medusa.indexOf("export const getProductByHandle"),
    medusa.indexOf("export const COLLECTIONS_MAX_LIMIT"),
  );
  assert.doesNotMatch(byHandle, /catalogFetch/);

  const pdp = await read("src/pages/products/[...handle].astro");
  assert.match(pdp, /robots=\{robots\}/);
  assert.match(pdp, /X-Robots-Tag/);
  assert.match(pdp, /unlisted=\{unlisted\}/);

  const layout = await read("src/layouts/BaseLayout.astro");
  // A page directive can only make a page less indexable.
  assert.match(layout, /\? "noindex, nofollow"\s*:\s*\(pageRobots \?\? "index, follow"\)/);

  for (const path of ["src/pages/sitemap.xml.ts", "src/pages/llms.txt.ts"]) {
    assert.match(await read(path), /getProducts\(/, `${path} lists through getProducts`);
  }
});

test("site config: the listing key parses, and a malformed one never drops other settings", async (t) => {
  const server = await serverFor("");
  t.after(() => server.close());
  const { SiteConfigOverlayResult } = await server.ssrLoadModule(
    fileURLToPath(new URL("../src/utils/schemas.ts", import.meta.url)),
  );
  assert.equal(
    SiteConfigOverlayResult.parse({ storeName: "S", listingPublishableKey: "pk_1" }).listingPublishableKey,
    "pk_1",
  );
  const bad = SiteConfigOverlayResult.parse({ storeName: "S", listingPublishableKey: 42 });
  assert.equal(bad.listingPublishableKey, null);
  assert.equal(bad.storeName, "S");
  assert.equal(SiteConfigOverlayResult.parse({ storeName: "S" }).listingPublishableKey, undefined);
});
