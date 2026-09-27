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

const category = {
  id: "pcat_kurtas",
  name: "Kurtas",
  handle: "kurtas",
  description: "Everyday kurtas.",
};

test("lists collections against /store/product-categories with the right fields", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return Response.json({
      product_categories: [category],
      count: 1,
      offset: 0,
      limit: 50,
    });
  };

  try {
    const page = await medusa.getCollections({});
    assert.equal(page.product_categories.length, 1);
    assert.equal(page.product_categories[0].handle, "kurtas");

    const requestUrl = new URL(requests[0]);
    assert.equal(requestUrl.pathname, "/store/product-categories");
    assert.equal(
      requestUrl.searchParams.get("fields"),
      "id,name,handle,description",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gets a collection by handle, or null when none matches", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const requestUrl = new URL(String(input));
    const handle = requestUrl.searchParams.get("handle");
    return Response.json({
      product_categories: handle === "kurtas" ? [category] : [],
    });
  };

  try {
    const found = await medusa.getCollectionByHandle({ handle: "kurtas" });
    assert.equal(found?.id, "pcat_kurtas");

    const missing = await medusa.getCollectionByHandle({ handle: "nope" });
    assert.equal(missing, null);
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

test("collections are reachable from the header, footer, and a top-level index", async () => {
  const header = await read("src/components/Header.astro");
  const footer = await read("src/components/Footer.astro");
  const index = await read("src/pages/collections/index.astro");

  assert.match(header, /getCollections/);
  assert.match(header, /\/collections\//);
  assert.match(footer, /href="\/collections"/);
  assert.match(index, /getCollections/);
});
