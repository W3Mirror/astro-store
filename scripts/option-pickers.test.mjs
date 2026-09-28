import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, appType: "custom" });

const vs = await server.ssrLoadModule(
  fileURLToPath(new URL("../src/utils/variant-selection.ts", import.meta.url)),
);

test.after(async () => {
  await server.close();
});

test("isColourOptionTitle matches Colour/Color case-insensitively, nothing else", () => {
  assert.equal(vs.isColourOptionTitle("Colour"), true);
  assert.equal(vs.isColourOptionTitle("color"), true);
  assert.equal(vs.isColourOptionTitle(" COLOUR "), true);
  assert.equal(vs.isColourOptionTitle("Fabric"), false);
  assert.equal(vs.isColourOptionTitle("Colourway"), false);
});

test("isSizeOptionTitle matches only exactly 'Size', case-insensitively", () => {
  assert.equal(vs.isSizeOptionTitle("Size"), true);
  assert.equal(vs.isSizeOptionTitle(" size "), true);
  assert.equal(vs.isSizeOptionTitle("SIZE"), true);
  assert.equal(vs.isSizeOptionTitle("Shoe Size"), false);
  assert.equal(vs.isSizeOptionTitle("Sizing"), false);
});

test("getVariantImageUrl reads metadata.image_url, falls back to undefined", () => {
  assert.equal(
    vs.getVariantImageUrl({ metadata: { image_url: "https://x/y.jpg" } }),
    "https://x/y.jpg",
  );
  assert.equal(vs.getVariantImageUrl({ metadata: { image_url: "  " } }), undefined);
  assert.equal(vs.getVariantImageUrl({ metadata: {} }), undefined);
  assert.equal(vs.getVariantImageUrl({ metadata: null }), undefined);
  assert.equal(vs.getVariantImageUrl(undefined), undefined);
});

// Rule 4a fixture: Type [Unstitched, Stitched] x Size [Free Size, S, M, L],
// where Unstitched only ever pairs with Free Size (a fabric-length product
// isn't "sized"), mirroring the spec's own example data.
const typeOption = {
  id: "opt_type",
  title: "Type",
  values: [{ value: "Unstitched" }, { value: "Stitched" }],
};
const sizeOption = {
  id: "opt_size",
  title: "Size",
  values: [
    { value: "Free Size" },
    { value: "S" },
    { value: "M" },
    { value: "L" },
  ],
};
const variant = (id, type, size, overrides = {}) => ({
  id,
  title: `${type} / ${size}`,
  inventory_quantity: 5,
  allow_backorder: false,
  manage_inventory: true,
  options: [
    { option_id: "opt_type", value: type },
    { option_id: "opt_size", value: size },
  ],
  calculated_price: {
    calculated_amount: 100,
    original_amount: 100,
    currency_code: "inr",
  },
  ...overrides,
});
const product = {
  id: "prod_1",
  title: "Suit",
  handle: "suit",
  description: null,
  thumbnail: null,
  collection_id: null,
  images: [],
  categories: [],
  options: [typeOption, sizeOption],
  variants: [
    variant("v_u_free", "Unstitched", "Free Size"),
    variant("v_s_s", "Stitched", "S"),
    variant("v_s_m", "Stitched", "M"),
    variant("v_s_l", "Stitched", "L"),
  ],
};

test("computeForcedOptions: Unstitched forces Size down to its one valid value (Free Size), Type stays free", () => {
  const forced = vs.computeForcedOptions(product, {
    opt_type: "Unstitched",
    opt_size: "Free Size",
  });
  assert.deepEqual(forced, [{ optionId: "opt_size", value: "Free Size" }]);
});

test("computeForcedOptions: Stitched leaves Size with three valid values (not forced)", () => {
  const forced = vs.computeForcedOptions(product, {
    opt_type: "Stitched",
    opt_size: "S",
  });
  assert.deepEqual(
    forced.filter((f) => f.optionId === "opt_size"),
    [],
  );
});

test("computeForcedOptions: an option with only one value store-wide is always forced", () => {
  const singleTypeProduct = {
    ...product,
    options: [
      { id: "opt_type", title: "Type", values: [{ value: "Stitched" }] },
      sizeOption,
    ],
    variants: [
      variant("v_s_s", "Stitched", "S"),
      variant("v_s_m", "Stitched", "M"),
    ],
  };
  const forced = vs.computeForcedOptions(singleTypeProduct, {
    opt_type: "Stitched",
    opt_size: "S",
  });
  assert.deepEqual(forced, [{ optionId: "opt_type", value: "Stitched" }]);
});

test("buildOptionGroups exposes imageUrl per value from the candidate variant's metadata.image_url", () => {
  const colourOption = {
    id: "opt_colour",
    title: "Colour",
    values: [{ value: "Red" }, { value: "Blue" }],
  };
  const withImages = {
    ...product,
    options: [colourOption],
    variants: [
      variant("v_red", "Unstitched", "Free Size", {
        options: [{ option_id: "opt_colour", value: "Red" }],
        metadata: { image_url: "https://x/red.jpg" },
      }),
      variant("v_blue", "Unstitched", "Free Size", {
        options: [{ option_id: "opt_colour", value: "Blue" }],
        metadata: {},
      }),
    ],
  };
  const groups = vs.buildOptionGroups(withImages, { opt_colour: "Red" });
  const colourGroup = groups.find((g) => g.id === "opt_colour");
  const red = colourGroup.values.find((v) => v.value === "Red");
  const blue = colourGroup.values.find((v) => v.value === "Blue");
  assert.equal(red.imageUrl, "https://x/red.jpg");
  assert.equal(blue.imageUrl, undefined);
});
