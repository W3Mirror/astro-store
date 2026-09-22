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
const productQuery = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/product-query.ts", import.meta.url)),
);
const productPagination = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/product-pagination.ts", import.meta.url)),
);
const schemas = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/schemas.ts", import.meta.url)),
);
const cartStore = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/stores/cart.ts", import.meta.url)),
);

const product = {
  id: "prod_test",
  title: "Test product",
  handle: "test-product",
  description: null,
  thumbnail: null,
  collection_id: null,
  images: [],
  options: [],
  variants: [],
};

const cartResponse = (quantity) => ({
  cart: {
    id: "cart_test",
    currency_code: "usd",
    item_total: quantity * 100,
    subtotal: quantity * 100,
    total: quantity * 100,
    items: [
      {
        id: "line_test",
        quantity,
        title: "Test product",
        unit_price: 100,
        variant_id: "variant_test",
      },
    ],
    shipping_methods: [],
  },
});

test.after(async () => {
  await server.close();
});

test("uses the storefront route defaults for missing and blank query values", () => {
  assert.deepEqual(productQuery.parseProductQuery(new URLSearchParams()), {
    limit: 24,
    offset: 0,
    query: undefined,
    collectionId: undefined,
    categoryId: undefined,
    order: "-created_at",
  });
  assert.equal(
    productQuery.parseProductQuery(new URLSearchParams("limit=")).limit,
    24,
  );
});

test("keeps URL catalog filters while trimming and bounding route values", () => {
  assert.deepEqual(
    productQuery.parseProductQuery(
      new URLSearchParams(
        "limit=999&offset=-2&q=%20linen%20&collection_id=%20collection_test%20&category_id=category_test&order=title",
      ),
    ),
    {
      limit: 48,
      offset: 0,
      query: "linen",
      collectionId: "collection_test",
      categoryId: "category_test",
      order: "title",
    },
  );
});

test("does not hide a possible next page behind an estimated undercount", () => {
  const pagination = productPagination.getProductPagination({
    offset: 0,
    limit: 24,
    count: 12,
    productCount: 24,
    countIsEstimated: true,
  });

  assert.equal(pagination.hasNext, true);
  assert.equal(pagination.label, "Showing 1–24 products");
});

test("ends estimated pagination only after a short page", () => {
  const pagination = productPagination.getProductPagination({
    offset: 24,
    limit: 24,
    count: 999,
    productCount: 3,
    countIsEstimated: true,
  });

  assert.equal(pagination.hasNext, false);
  assert.equal(pagination.label, "Showing 25–27 products");
});

test("uses exact totals for exact-count pagination", () => {
  const full = productPagination.getProductPagination({
    offset: 0,
    limit: 24,
    count: 48,
    productCount: 24,
    countIsEstimated: false,
  });
  const last = productPagination.getProductPagination({
    offset: 24,
    limit: 24,
    count: 30,
    productCount: 6,
    countIsEstimated: false,
  });

  assert.equal(full.hasNext, true);
  assert.equal(full.label, "Showing 1–24 of 48");
  assert.equal(last.hasNext, false);
  assert.equal(last.label, "Showing 25–30 of 30");
});

test("does not expose opaque catalog IDs as shopper-entered filters", async () => {
  const route = await read("src/pages/products/index.astro");

  assert.doesNotMatch(route, /Collection ID|Category ID/);
  assert.match(route, /type="hidden" name="collection_id"/);
  assert.match(route, /type="hidden" name="category_id"/);
});

test("serializes bounded product filters and parses pagination metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return Response.json({
      products: [product],
      count: 9,
      offset: 0,
      limit: 500,
      estimate_count: 9,
    });
  };

  try {
    const page = await medusa.getProductPage({
      limit: 9999,
      offset: -3,
      q: "  linen  ",
      collectionId: " collection_test ",
      categoryId: " category_test ",
      order: " -created_at ",
    });

    assert.equal(page.count, 9);
    assert.equal(page.estimate_count, 9);
    assert.equal(page.countIsEstimated, true);
    assert.equal(page.products[0].id, "prod_test");
    assert.equal(requests.length, 1);

    const requestUrl = new URL(requests[0].input);
    assert.equal(requestUrl.pathname, "/store/products");
    assert.equal(requestUrl.searchParams.get("limit"), "500");
    assert.equal(requestUrl.searchParams.get("offset"), "0");
    assert.equal(requestUrl.searchParams.get("q"), "linen");
    assert.equal(
      requestUrl.searchParams.get("collection_id"),
      "collection_test",
    );
    assert.equal(requestUrl.searchParams.get("category_id"), "category_test");
    assert.equal(requestUrl.searchParams.get("order"), "-created_at");
    assert.equal(requestUrl.searchParams.get("region_id"), "reg_test");
    assert.equal(requests[0].init.headers["x-publishable-api-key"], "pk_test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("marks responses without estimate_count as exact", () => {
  const page = schemas.ProductPageResult.parse({
    products: [product],
    count: 1,
    offset: 0,
    limit: 24,
  });

  assert.equal(page.countIsEstimated, false);
  assert.equal(page.estimate_count, undefined);
});

test("serializes overlapping quantity updates so server order stays deterministic", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let resolveFirst;

  cartStore.cart.set({
    id: "cart_test",
    currency_code: "usd",
    item_total: 100,
    subtotal: 100,
    total: 100,
    items: [
      {
        id: "line_test",
        quantity: 1,
        title: "Test product",
        unit_price: 100,
        variant_id: "variant_test",
      },
    ],
    shipping_methods: [],
  });

  globalThis.fetch = (input, init) => {
    requests.push({ input: String(input), init });
    if (requests.length === 1) {
      return new Promise((resolve) => {
        resolveFirst = () => resolve(Response.json(cartResponse(2)));
      });
    }
    return Promise.resolve(Response.json(cartResponse(3)));
  };

  try {
    const first = cartStore.updateCartItem("line_test", 2);
    const second = cartStore.updateCartItem("line_test", 3);

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(requests.length, 1);
    assert.equal(cartStore.isCartUpdating.get(), true);

    resolveFirst();
    await first;
    await second;

    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.map(({ init }) => JSON.parse(init.body).quantity),
      [2, 3],
    );
    assert.equal(
      new URL(requests[0].input).pathname,
      "/store/carts/cart_test/line-items/line_test",
    );
    assert.equal(requests[0].init.method, "POST");
    assert.equal(cartStore.cart.get().items[0].quantity, 3);
    assert.equal(cartStore.isCartUpdating.get(), false);
    assert.equal(cartStore.cartError.get(), null);
  } finally {
    globalThis.fetch = originalFetch;
    cartStore.clearCart();
  }
});
