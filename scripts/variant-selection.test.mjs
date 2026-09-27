import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, appType: "custom" });

const variantSelection = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/variant-selection.ts", import.meta.url)),
);

test.after(async () => {
  await server.close();
});

// A two-option product mirroring the reference store's "Kashmiri Kaam Suit"
// shape: Fabric [Rayon, Cotton] x Type [Unstitched, Stitched], with one
// missing combination (Cotton x Stitched doesn't exist) and one out-of-stock
// combination (Cotton x Unstitched exists but has no stock).
const fabricOption = {
  id: "opt_fabric",
  title: "Fabric",
  values: [{ value: "Rayon" }, { value: "Cotton" }],
};
const typeOption = {
  id: "opt_type",
  title: "Type",
  values: [{ value: "Unstitched" }, { value: "Stitched" }],
};

const variant = (id, fabric, type, overrides = {}) => ({
  id,
  title: `${fabric} / ${type}`,
  sku: id.toUpperCase(),
  inventory_quantity: 5,
  allow_backorder: false,
  manage_inventory: true,
  options: [
    { option_id: "opt_fabric", value: fabric },
    { option_id: "opt_type", value: type },
  ],
  calculated_price: {
    calculated_amount: 100,
    original_amount: 100,
    currency_code: "inr",
  },
  ...overrides,
});

const product = {
  id: "prod_p16",
  title: "Kashmiri Kaam Suit",
  handle: "kashmiri-kaam-suit",
  description: null,
  thumbnail: null,
  collection_id: null,
  images: [],
  categories: [],
  options: [fabricOption, typeOption],
  variants: [
    variant("var_ray_u", "Rayon", "Unstitched"),
    variant("var_ray_s", "Rayon", "Stitched"),
    variant("var_cot_u", "Cotton", "Unstitched", { inventory_quantity: 0 }),
    // No Cotton x Stitched variant exists.
  ],
};

const singleVariantProduct = {
  ...product,
  options: [],
  variants: [variant("var_only", "Rayon", "Unstitched")],
};

test("treats untracked/backorderable inventory as unlimited stock", () => {
  const untracked = variantSelection.getVariantAvailability({
    manage_inventory: false,
    allow_backorder: false,
    inventory_quantity: 0,
  });
  assert.equal(untracked.quantityAvailable, Infinity);
  assert.equal(untracked.availableForSale, true);

  const backorderable = variantSelection.getVariantAvailability({
    manage_inventory: true,
    allow_backorder: true,
    inventory_quantity: 0,
  });
  assert.equal(backorderable.quantityAvailable, Infinity);
  assert.equal(backorderable.availableForSale, true);

  const trackedEmpty = variantSelection.getVariantAvailability({
    manage_inventory: true,
    allow_backorder: false,
    inventory_quantity: 0,
  });
  assert.equal(trackedEmpty.quantityAvailable, 0);
  assert.equal(trackedEmpty.availableForSale, false);

  assert.deepEqual(variantSelection.getVariantAvailability(undefined), {
    quantityAvailable: 0,
    availableForSale: false,
  });
});

test("finds the exact variant for a full option selection", () => {
  const found = variantSelection.findVariantForSelection(product, {
    opt_fabric: "Rayon",
    opt_type: "Stitched",
  });
  assert.equal(found?.id, "var_ray_s");
});

test("returns undefined for a combination that doesn't exist", () => {
  const found = variantSelection.findVariantForSelection(product, {
    opt_fabric: "Cotton",
    opt_type: "Stitched",
  });
  assert.equal(found, undefined);
});

test("a product with no declared options resolves to its single variant", () => {
  const found = variantSelection.findVariantForSelection(
    singleVariantProduct,
    {},
  );
  assert.equal(found?.id, "var_only");
});

test("default variant is the first in-stock one, skipping an out-of-stock leader", () => {
  const outOfStockFirst = {
    ...product,
    variants: [
      variant("var_cot_u", "Cotton", "Unstitched", { inventory_quantity: 0 }),
      variant("var_ray_u", "Rayon", "Unstitched"),
    ],
  };
  const defaultVariant = variantSelection.getDefaultVariant(outOfStockFirst);
  assert.equal(defaultVariant?.id, "var_ray_u");
});

test("falls back to the first variant when nothing is in stock", () => {
  const allOutOfStock = {
    ...product,
    variants: [
      variant("var_ray_u", "Rayon", "Unstitched", { inventory_quantity: 0 }),
      variant("var_ray_s", "Rayon", "Stitched", { inventory_quantity: 0 }),
    ],
  };
  const defaultVariant = variantSelection.getDefaultVariant(allOutOfStock);
  assert.equal(defaultVariant?.id, "var_ray_u");
});

test("an explicit ?variant= id wins when it names a real variant", () => {
  const resolved = variantSelection.resolveInitialVariant(product, "var_ray_s");
  assert.equal(resolved?.id, "var_ray_s");
});

test("an unknown or missing ?variant= id falls back to the default", () => {
  const unknown = variantSelection.resolveInitialVariant(
    product,
    "var_does_not_exist",
  );
  assert.equal(unknown?.id, "var_ray_u");

  const missing = variantSelection.resolveInitialVariant(product, null);
  assert.equal(missing?.id, "var_ray_u");
});

test("selectionFromVariant round-trips through findVariantForSelection", () => {
  const target = product.variants[2];
  const selection = variantSelection.selectionFromVariant(target);
  const found = variantSelection.findVariantForSelection(product, selection);
  assert.equal(found?.id, target.id);
});

test("option matrix marks a non-existent combination disabled and an existing-but-empty one sold out", () => {
  const groups = variantSelection.buildOptionGroups(product, {
    opt_fabric: "Rayon",
    opt_type: "Unstitched",
  });

  const fabricGroup = groups.find((group) => group.id === "opt_fabric");
  const cotton = fabricGroup.values.find((value) => value.value === "Cotton");
  assert.equal(cotton.exists, true); // Cotton x Unstitched exists...
  assert.equal(cotton.inStock, false); // ...but has no stock.

  const typeGroup = groups.find((group) => group.id === "opt_type");
  const stitchedWhileCotton = variantSelection.buildOptionGroups(product, {
    opt_fabric: "Cotton",
    opt_type: "Unstitched",
  });
  const stitchedGroup = stitchedWhileCotton.find(
    (group) => group.id === "opt_type",
  );
  const stitched = stitchedGroup.values.find(
    (value) => value.value === "Stitched",
  );
  assert.equal(stitched.exists, false); // Cotton x Stitched never exists.

  const selectedRayon = fabricGroup.values.find(
    (value) => value.value === "Rayon",
  );
  assert.equal(selectedRayon.selected, true);
  assert.equal(
    typeGroup.values.find((value) => value.value === "Unstitched").selected,
    true,
  );
});

test("needsVariantPicker is false for single-variant products, true for multi-variant ones", () => {
  assert.equal(
    variantSelection.needsVariantPicker(singleVariantProduct),
    false,
  );
  assert.equal(variantSelection.needsVariantPicker(product), true);
  assert.equal(
    variantSelection.needsVariantPicker({ options: [], variants: [] }),
    false,
  );
});
