import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const server = await createServer({
  root,
  appType: "custom",
  define: {
    "import.meta.env.PUBLIC_MEDUSA_BACKEND_URL": JSON.stringify(
      "https://backend.example",
    ),
    "import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY": JSON.stringify("pk_test"),
    "import.meta.env.PUBLIC_MEDUSA_REGION_ID": JSON.stringify("reg_test"),
    "import.meta.env.PUBLIC_STORE_NAME": JSON.stringify("Test Store"),
    "import.meta.env.PUBLIC_ANNOUNCEMENT_MESSAGE": JSON.stringify(""),
    "import.meta.env.PUBLIC_SITE_CONFIG_URL": JSON.stringify(""),
    "import.meta.env.PUBLIC_CUSTOMER_ENGAGEMENT_ENABLED":
      JSON.stringify("false"),
    "import.meta.env.PUBLIC_RECOMMENDATIONS_ENABLED": JSON.stringify("false"),
  },
});

const medusa = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/medusa.ts", import.meta.url)),
);

test.after(async () => {
  await server.close();
});

// A plain legacy category: never got a `metadata.display_handle` (created
// before the many-to-many collections rework, or before ecomm-ai's
// `uniqueCollectionHandle` fix — see `CategoryResult`'s doc comment), so its
// raw `handle` IS the merchant-facing one already.
const legacyCategory = {
  id: "pcat_kurtas",
  name: "Kurtas",
  handle: "kurtas",
  description: "Everyday kurtas.",
  metadata: null,
};

// A category created by `add_collection` after the fix: the backend
// `handle` is store-scoped and hash-suffixed
// (`nagama-gota-patti-mirror-work-7a7e4f`), but the merchant-facing handle
// — the one every storefront URL/link must use — lives in
// `metadata.display_handle`.
const hashedCategory = {
  id: "pcat_gota",
  name: "Gota Patti Mirror Work",
  handle: "nagama-gota-patti-mirror-work-7a7e4f",
  description: null,
  metadata: { display_handle: "gota-patti-mirror-work" },
};

const mockCategoryList = (categories) =>
  Response.json({
    product_categories: categories,
    count: categories.length,
    offset: 0,
    limit: 50,
  });

test("lists collections against /store/product-categories with the right fields, including metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return mockCategoryList([legacyCategory]);
  };

  try {
    const page = await medusa.getCollections({});
    assert.equal(page.product_categories.length, 1);
    assert.equal(page.product_categories[0].handle, "kurtas");

    const requestUrl = new URL(requests[0]);
    assert.equal(requestUrl.pathname, "/store/product-categories");
    assert.equal(
      requestUrl.searchParams.get("fields"),
      "id,name,handle,description,metadata",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a category's storefront handle prefers metadata.display_handle over the raw backend handle", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockCategoryList([legacyCategory, hashedCategory]);

  try {
    const page = await medusa.getCollections({});
    const [legacy, hashed] = page.product_categories;

    // No `display_handle` on record — the raw handle already IS the clean
    // one, so it's used as-is.
    assert.equal(legacy.handle, "kurtas");
    assert.equal(legacy.rawHandle, "kurtas");

    // A hash-suffixed backend handle never leaks into the storefront handle
    // once `metadata.display_handle` is set.
    assert.equal(hashed.handle, "gota-patti-mirror-work");
    assert.equal(hashed.rawHandle, "nagama-gota-patti-mirror-work-7a7e4f");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolves a collection by its clean, merchant-facing handle", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockCategoryList([legacyCategory, hashedCategory]);

  try {
    const found = await medusa.getCollectionByHandle({
      handle: "gota-patti-mirror-work",
    });
    assert.equal(found.kind, "found");
    assert.equal(found.category.id, "pcat_gota");
    assert.equal(found.category.handle, "gota-patti-mirror-work");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolving a collection by its raw/prefixed backend handle asks the caller to redirect to the clean one", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockCategoryList([legacyCategory, hashedCategory]);

  try {
    const result = await medusa.getCollectionByHandle({
      handle: "nagama-gota-patti-mirror-work-7a7e4f",
    });
    assert.deepEqual(result, {
      kind: "redirect",
      canonicalHandle: "gota-patti-mirror-work",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unknown handle (neither clean nor raw) is not-found", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockCategoryList([legacyCategory, hashedCategory]);

  try {
    const result = await medusa.getCollectionByHandle({ handle: "nope" });
    assert.deepEqual(result, { kind: "not-found" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a collection page scopes products by the category id, not by a spoofable query param", async () => {
  const route = await read("src/pages/collections/[handle].astro");
  assert.match(route, /categoryId: collection\.id/);
  assert.doesNotMatch(route, /searchParams\.get\("category_id"\)/);
});

test("unknown collection handles render the 404 layout", async () => {
  const route = await read("src/pages/collections/[handle].astro");
  assert.match(route, /NotFoundLayout/);
});

test("a raw/prefixed handle 301-redirects to the clean canonical URL, preserving the query string", async () => {
  const route = await read("src/pages/collections/[handle].astro");
  assert.match(route, /lookup\.kind === "redirect"/);
  assert.match(route, /Astro\.redirect\(/);
  assert.match(route, /,\s*301\)/);
  assert.match(route, /target\.search/);
});

test("collections are reachable from the header, footer, and a top-level index", async () => {
  const header = await read("src/components/Header.astro");
  const footer = await read("src/components/Footer.astro");
  const index = await read("src/pages/collections/index.astro");

  assert.match(header, /getCollections/);
  assert.match(header, /\/collections\//);
  assert.match(footer, /href="\/collections"/);
  assert.match(index, /getCollections/);
});

// The header nav caps how many collections it lists (`NAV_COLLECTION_LIMIT`)
// so it stays a single scrollable row rather than growing unbounded — every
// collection beyond that cap must still be reachable via an explicit
// "view all" link to the top-level `/collections` index, not silently
// dropped from navigation.
test("a capped header nav still links to the full /collections index", async () => {
  const header = await read("src/components/Header.astro");

  assert.match(header, /NAV_COLLECTION_LIMIT/);
  assert.match(header, /href="\/collections"/);
});
