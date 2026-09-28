import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, appType: "custom" });

const filters = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/product-filters.ts", import.meta.url)),
);
const pagination = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/product-pagination.ts", import.meta.url)),
);

test.after(async () => {
  await server.close();
});

// Minimal products covering: two option axes (Fabric, Type — deliberately
// generic, never store-specific values baked into assertions beyond these
// fixtures), a mix of stock/out-of-stock, and a price spread.
const variant = (id, overrides = {}) => ({
  id,
  title: id,
  sku: id.toUpperCase(),
  inventory_quantity: 5,
  allow_backorder: false,
  manage_inventory: true,
  options: [],
  calculated_price: {
    calculated_amount: 100,
    original_amount: 100,
    currency_code: "inr",
  },
  ...overrides,
});

const product = (id, overrides = {}) => ({
  id,
  title: id,
  handle: id,
  description: null,
  thumbnail: null,
  collection_id: null,
  images: [],
  categories: [],
  options: [],
  variants: [variant(`${id}_v1`)],
  ...overrides,
});

const fabricOption = (values) => ({
  id: "opt_fabric",
  title: "Fabric",
  values: values.map((value) => ({ value })),
});
const typeOption = (values) => ({
  id: "opt_type",
  title: "Type",
  values: values.map((value) => ({ value })),
});

const cottonInStock = product("p_cotton", {
  options: [fabricOption(["Cotton"]), typeOption(["Stitched"])],
  variants: [
    variant("p_cotton_v1", {
      calculated_price: {
        calculated_amount: 500,
        original_amount: 500,
        currency_code: "inr",
      },
    }),
  ],
});
const silkOutOfStock = product("p_silk", {
  options: [fabricOption(["Silk"]), typeOption(["Unstitched"])],
  variants: [
    variant("p_silk_v1", {
      inventory_quantity: 0,
      calculated_price: {
        calculated_amount: 1500,
        original_amount: 1500,
        currency_code: "inr",
      },
    }),
  ],
});
const cottonAndSilk = product("p_mixed", {
  options: [fabricOption(["Cotton", "Silk"]), typeOption(["Stitched"])],
  variants: [
    variant("p_mixed_v1", {
      calculated_price: {
        calculated_amount: 900,
        original_amount: 900,
        currency_code: "inr",
      },
    }),
  ],
});

const pool = [cottonInStock, silkOutOfStock, cottonAndSilk];

test("slugifyOptionTitle turns any option title into a generic, url-safe key", () => {
  assert.equal(filters.slugifyOptionTitle("Fabric"), "fabric");
  assert.equal(filters.slugifyOptionTitle("Neck Type"), "neck-type");
  assert.equal(filters.slugifyOptionTitle("  Colour/Color  "), "colour-color");
});

test("parseProductFacetFilters reads in_stock, price bounds, collections, and opt_* axes", () => {
  const params = new URLSearchParams(
    "in_stock=1&price_min=200&price_max=1000&collections=cat_1,cat_2&opt_fabric=Cotton,Silk&opt_type=Stitched&unrelated=1",
  );
  const parsed = filters.parseProductFacetFilters(params);
  assert.equal(parsed.inStockOnly, true);
  assert.equal(parsed.priceMin, 200);
  assert.equal(parsed.priceMax, 1000);
  assert.deepEqual(parsed.collectionIds, ["cat_1", "cat_2"]);
  assert.deepEqual(parsed.optionFilters, {
    fabric: ["Cotton", "Silk"],
    type: ["Stitched"],
  });
});

test("parseProductFacetFilters ignores a negative/garbage price and ignores blank axis values", () => {
  const parsed = filters.parseProductFacetFilters(
    new URLSearchParams("price_min=-5&price_max=abc&opt_fabric=,, ,"),
  );
  assert.equal(parsed.priceMin, undefined);
  assert.equal(parsed.priceMax, undefined);
  assert.deepEqual(parsed.optionFilters, {});
});

test("serializeProductFacetFilters round-trips through parseProductFacetFilters", () => {
  const original = filters.parseProductFacetFilters(
    new URLSearchParams(
      "in_stock=1&price_min=100&collections=cat_1&opt_fabric=Cotton",
    ),
  );
  const serialized = filters.serializeProductFacetFilters(original);
  const reparsed = filters.parseProductFacetFilters(serialized);
  assert.deepEqual(reparsed, original);
});

test("needsClientSideFiltering is false with no facets and a server-sortable order", () => {
  const none = filters.parseProductFacetFilters(new URLSearchParams(""));
  assert.equal(filters.needsClientSideFiltering(none, "-created_at"), false);
});

test("needsClientSideFiltering is true for any active facet or a price sort", () => {
  const none = filters.parseProductFacetFilters(new URLSearchParams(""));
  assert.equal(filters.needsClientSideFiltering(none, "price-asc"), true);
  const inStock = filters.parseProductFacetFilters(
    new URLSearchParams("in_stock=1"),
  );
  assert.equal(filters.needsClientSideFiltering(inStock, "-created_at"), true);
});

test("applyProductFacetFilters: in_stock drops out-of-stock products", () => {
  const result = filters.applyProductFacetFilters(pool, {
    inStockOnly: true,
    collectionIds: [],
    optionFilters: {},
  });
  assert.deepEqual(
    result.map((p) => p.id),
    ["p_cotton", "p_mixed"],
  );
});

test("applyProductFacetFilters: price range is inclusive on both ends", () => {
  const result = filters.applyProductFacetFilters(pool, {
    inStockOnly: false,
    priceMin: 500,
    priceMax: 900,
    collectionIds: [],
    optionFilters: {},
  });
  assert.deepEqual(
    result.map((p) => p.id).sort(),
    ["p_cotton", "p_mixed"],
  );
});

test("applyProductFacetFilters: OR within one axis, AND across two axes", () => {
  const orWithinAxis = filters.applyProductFacetFilters(pool, {
    inStockOnly: false,
    collectionIds: [],
    optionFilters: { fabric: ["Cotton", "Silk"] },
  });
  assert.deepEqual(
    orWithinAxis.map((p) => p.id).sort(),
    ["p_cotton", "p_mixed", "p_silk"],
  );

  const andAcrossAxes = filters.applyProductFacetFilters(pool, {
    inStockOnly: false,
    collectionIds: [],
    optionFilters: { fabric: ["Silk"], type: ["Stitched"] },
  });
  // Only p_mixed declares both Silk (fabric) and Stitched (type).
  assert.deepEqual(
    andAcrossAxes.map((p) => p.id),
    ["p_mixed"],
  );
});

test("sortProducts sorts by min variant price for price-asc/price-desc, leaves other orders untouched", () => {
  const asc = filters.sortProducts(pool, "price-asc");
  assert.deepEqual(
    asc.map((p) => p.id),
    ["p_cotton", "p_mixed", "p_silk"],
  );
  const desc = filters.sortProducts(pool, "price-desc");
  assert.deepEqual(
    desc.map((p) => p.id),
    ["p_silk", "p_mixed", "p_cotton"],
  );
  assert.deepEqual(filters.sortProducts(pool, "title"), pool);
});

test("deriveOptionFacets groups by title, counts each product at most once per value", () => {
  const facets = filters.deriveOptionFacets(pool);
  const fabric = facets.find((f) => f.axisKey === "fabric");
  assert.ok(fabric);
  assert.equal(fabric.title, "Fabric");
  const cotton = fabric.values.find((v) => v.value === "Cotton");
  const silk = fabric.values.find((v) => v.value === "Silk");
  assert.equal(cotton.count, 2); // p_cotton, p_mixed
  assert.equal(silk.count, 2); // p_silk, p_mixed
});

test("derivePriceBounds returns the min/max across the pool, undefined when no prices exist", () => {
  const bounds = filters.derivePriceBounds(pool);
  assert.deepEqual(bounds, { min: 500, max: 1500 });
  assert.equal(
    filters.derivePriceBounds([
      product("p_no_price", {
        variants: [variant("v1", { calculated_price: null })],
      }),
    ]),
    undefined,
  );
});

test("deriveAvailabilityCounts counts in-stock vs. total", () => {
  assert.deepEqual(filters.deriveAvailabilityCounts(pool), {
    inStock: 2,
    total: 3,
  });
});

test("parseProductFacetFilters merges repeated same-name checkbox params (a real <form> submission)", () => {
  const parsed = filters.parseProductFacetFilters(
    new URLSearchParams(
      "collections=cat_1&collections=cat_2&opt_fabric=Cotton&opt_fabric=Silk",
    ),
  );
  assert.deepEqual(parsed.collectionIds, ["cat_1", "cat_2"]);
  assert.deepEqual(parsed.optionFilters, { fabric: ["Cotton", "Silk"] });
});

test("withoutAvailability/withoutPrice/withoutCollectionId/withoutOptionValue each drop exactly one thing", () => {
  const base = filters.parseProductFacetFilters(
    new URLSearchParams(
      "in_stock=1&price_min=100&price_max=900&collections=cat_1,cat_2&opt_fabric=Cotton,Silk",
    ),
  );
  assert.equal(filters.withoutAvailability(base).inStockOnly, false);
  const noPrice = filters.withoutPrice(base);
  assert.equal(noPrice.priceMin, undefined);
  assert.equal(noPrice.priceMax, undefined);
  assert.deepEqual(filters.withoutCollectionId(base, "cat_1").collectionIds, [
    "cat_2",
  ]);
  assert.deepEqual(
    filters.withoutOptionValue(base, "fabric", "Cotton").optionFilters,
    { fabric: ["Silk"] },
  );
  // Dropping the last value for an axis removes the axis entirely.
  assert.deepEqual(
    filters.withoutOptionValue(
      filters.withoutOptionValue(base, "fabric", "Cotton"),
      "fabric",
      "Silk",
    ).optionFilters,
    {},
  );
});

test("buildListingHref composes q/order/limit/offset with the serialized facets", () => {
  const href = filters.buildListingHref("/products", {
    q: "kurta",
    order: "price-asc",
    limit: 24,
    offset: 24,
    facets: filters.parseProductFacetFilters(new URLSearchParams("in_stock=1")),
  });
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/products");
  assert.equal(url.searchParams.get("q"), "kurta");
  assert.equal(url.searchParams.get("order"), "price-asc");
  assert.equal(url.searchParams.get("limit"), "24");
  assert.equal(url.searchParams.get("offset"), "24");
  assert.equal(url.searchParams.get("in_stock"), "1");
});

test("buildListingHref omits the default order and a zero offset", () => {
  const href = filters.buildListingHref("/collections/kurtas", {
    order: "-created_at",
    limit: 24,
    offset: 0,
    facets: filters.EMPTY_FACET_FILTERS,
  });
  const url = new URL(href, "https://example.test");
  assert.equal(url.searchParams.has("order"), false);
  assert.equal(url.searchParams.has("offset"), false);
});

test("pagination composes correctly over a filtered, exact (non-estimated) count", () => {
  const filtered = filters.applyProductFacetFilters(pool, {
    inStockOnly: true,
    collectionIds: [],
    optionFilters: {},
  });
  const page = pagination.getProductPagination({
    offset: 0,
    limit: 1,
    count: filtered.length,
    productCount: 1,
    countIsEstimated: false,
  });
  assert.equal(page.hasNext, true);
  assert.equal(page.label, "Showing 1–1 of 2");
});
