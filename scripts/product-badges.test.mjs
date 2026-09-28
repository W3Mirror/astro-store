import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, appType: "custom" });

const badges = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/product-badges.ts", import.meta.url)),
);

test.after(async () => {
  await server.close();
});

const variant = (overrides = {}) => ({
  id: "v1",
  title: "v1",
  inventory_quantity: 5,
  allow_backorder: false,
  manage_inventory: true,
  options: [],
  calculated_price: {
    calculated_amount: 500,
    original_amount: 500,
    currency_code: "inr",
  },
  ...overrides,
});

// --- compareAtPrice ---------------------------------------------------------

test("compareAtPrice: undefined when there's no discount", () => {
  assert.equal(badges.compareAtPrice(variant()), undefined);
});

test("compareAtPrice: undefined when calculated/original prices are missing", () => {
  assert.equal(badges.compareAtPrice(undefined), undefined);
  assert.equal(
    badges.compareAtPrice(variant({ calculated_price: null })),
    undefined,
  );
  assert.equal(
    badges.compareAtPrice(
      variant({
        calculated_price: {
          calculated_amount: null,
          original_amount: 500,
          currency_code: "inr",
        },
      }),
    ),
    undefined,
  );
});

test("compareAtPrice: the original amount when it's strictly greater than the calculated amount", () => {
  const price = badges.compareAtPrice(
    variant({
      calculated_price: {
        calculated_amount: 400,
        original_amount: 500,
        currency_code: "inr",
      },
    }),
  );
  assert.deepEqual(price, { amount: 500, currency_code: "inr" });
});

// --- isRecentlyCreated -------------------------------------------------------

test("isRecentlyCreated: true within the window, false on/after the boundary", () => {
  const now = new Date("2026-01-31T00:00:00.000Z");
  assert.equal(
    badges.isRecentlyCreated("2026-01-01T00:00:00.000Z", now, 30),
    true,
  );
  assert.equal(
    badges.isRecentlyCreated("2025-12-31T23:59:59.000Z", now, 30),
    false,
  );
});

test("isRecentlyCreated: false for null/unparsable/future created_at", () => {
  const now = new Date("2026-01-31T00:00:00.000Z");
  assert.equal(badges.isRecentlyCreated(null, now), false);
  assert.equal(badges.isRecentlyCreated(undefined, now), false);
  assert.equal(badges.isRecentlyCreated("not-a-date", now), false);
  assert.equal(
    badges.isRecentlyCreated("2026-06-01T00:00:00.000Z", now),
    false,
  );
});

test("isRecentlyCreated: defaults to a 30-day window matching NEW_BADGE_WINDOW_DAYS", () => {
  assert.equal(badges.NEW_BADGE_WINDOW_DAYS, 30);
});

// --- getProductBadges --------------------------------------------------------

const product = (overrides = {}) => ({
  variants: [variant()],
  created_at: null,
  ...overrides,
});

test("getProductBadges: soldOut is true only when every variant is unavailable", () => {
  const now = new Date("2026-01-31T00:00:00.000Z");
  const allSoldOut = product({
    variants: [variant({ inventory_quantity: 0 }), variant({ id: "v2", inventory_quantity: 0 })],
  });
  const oneInStock = product({
    variants: [variant({ inventory_quantity: 0 }), variant({ id: "v2", inventory_quantity: 3 })],
  });
  assert.equal(badges.getProductBadges(allSoldOut, allSoldOut.variants[0], now).soldOut, true);
  assert.equal(badges.getProductBadges(oneInStock, oneInStock.variants[0], now).soldOut, false);
});

test("getProductBadges: sale/comparePrice come from the passed-in representative variant", () => {
  const now = new Date("2026-01-31T00:00:00.000Z");
  const onSaleVariant = variant({
    calculated_price: { calculated_amount: 400, original_amount: 500, currency_code: "inr" },
  });
  const result = badges.getProductBadges(product({ variants: [onSaleVariant] }), onSaleVariant, now);
  assert.equal(result.sale, true);
  assert.deepEqual(result.comparePrice, { amount: 500, currency_code: "inr" });
});

test("getProductBadges: isNew reflects created_at against `now`", () => {
  const now = new Date("2026-01-31T00:00:00.000Z");
  const recent = product({ created_at: "2026-01-20T00:00:00.000Z" });
  const old = product({ created_at: "2020-01-01T00:00:00.000Z" });
  assert.equal(badges.getProductBadges(recent, recent.variants[0], now).isNew, true);
  assert.equal(badges.getProductBadges(old, old.variants[0], now).isNew, false);
});

test("getProductBadges: no sale, no comparePrice, when the representative variant is undefined", () => {
  const now = new Date("2026-01-31T00:00:00.000Z");
  const result = badges.getProductBadges(product(), undefined, now);
  assert.equal(result.sale, false);
  assert.equal(result.comparePrice, undefined);
});
