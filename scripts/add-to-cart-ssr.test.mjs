import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";
import svelte from "@astrojs/svelte";

// End-to-end regression test for the bug verified on the live Nagama TEST
// store: the "Add to bag" button rendered `disabled` in the server-rendered
// HTML for every `?variant=` of the P16 product ("Kashmiri Kaam Suit"), even
// though all three variants had positive tracked stock (5 / 3 / 5 at a
// single stock location). `scripts/variant-selection.test.mjs` already
// proves the pure `getVariantAvailability` function is correct in isolation;
// this test renders the real `ProductVariantPicker.svelte` ->
// `AddToCartForm.svelte` component tree through `svelte/server`, the same
// way Astro renders them for a request, so a wiring bug between the two
// components (not just a bug in the pure function) would also be caught.
const root = fileURLToPath(new URL("..", import.meta.url));

// A plain `vite.createServer` doesn't know how to compile `.svelte` files —
// only the `@astrojs/svelte` integration's Vite plugin does, and Astro only
// wires that plugin in via its own config loading. Pull the plugin/resolve
// config the same way `astro dev`/`astro build` would by invoking the
// integration's `astro:config:setup` hook with a stub that just captures
// what it passes to `updateConfig`.
const integration = svelte();
let viteConfigFromIntegration = {};
await integration.hooks["astro:config:setup"]({
  config: {},
  command: "dev",
  updateConfig: (cfg) => {
    viteConfigFromIntegration = cfg;
    return cfg;
  },
  addRenderer: () => {},
  injectScript: () => {},
  logger: {
    info() {},
    warn() {},
    error() {},
    fork: () => ({ info() {}, warn() {}, error() {} }),
  },
});

const server = await createServer({
  root,
  appType: "custom",
  plugins: viteConfigFromIntegration.vite?.plugins ?? [],
  resolve: viteConfigFromIntegration.vite?.resolve,
  define: {
    "import.meta.env.PUBLIC_MEDUSA_BACKEND_URL": JSON.stringify(
      "https://backend.example",
    ),
    "import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY": JSON.stringify("pk_test"),
    "import.meta.env.PUBLIC_MEDUSA_REGION_ID": JSON.stringify("reg_test"),
  },
});

test.after(async () => {
  await server.close();
});

const svelteServer = await server.ssrLoadModule("svelte/server");
const pickerMod = await server.ssrLoadModule(
  fileURLToPath(
    new URL("../src/components/ProductVariantPicker.svelte", import.meta.url),
  ),
);

// The exact P16 ("Kashmiri Kaam Suit") shape verified live: Fabric [Rayon,
// Cotton] x Type [Unstitched, Stitched], stock 5 / 3 / 5, all tracked
// (`manage_inventory: true`) and non-backorderable (`allow_backorder: false`).
const p16Product = {
  id: "prod_p16",
  title: "Kashmiri Kaam Suit",
  handle: "kashmiri-kaam-embroidered-suit",
  description: null,
  thumbnail: null,
  collection_id: null,
  images: [],
  categories: [],
  options: [
    {
      id: "opt_fabric",
      title: "Fabric",
      values: [{ value: "Rayon" }, { value: "Cotton" }],
    },
    {
      id: "opt_type",
      title: "Type",
      values: [{ value: "Unstitched" }, { value: "Stitched" }],
    },
  ],
  variants: [
    {
      id: "var_ray_u",
      title: "Rayon / Unstitched",
      sku: "NG-P16-RAY-U",
      inventory_quantity: 5,
      allow_backorder: false,
      manage_inventory: true,
      options: [
        { option_id: "opt_fabric", value: "Rayon" },
        { option_id: "opt_type", value: "Unstitched" },
      ],
      calculated_price: {
        calculated_amount: 2799,
        original_amount: 2799,
        currency_code: "inr",
      },
    },
    {
      id: "var_ray_s",
      title: "Rayon / Stitched",
      sku: "NG-P16-RAY-S",
      inventory_quantity: 3,
      allow_backorder: false,
      manage_inventory: true,
      options: [
        { option_id: "opt_fabric", value: "Rayon" },
        { option_id: "opt_type", value: "Stitched" },
      ],
      calculated_price: {
        calculated_amount: 3299,
        original_amount: 3299,
        currency_code: "inr",
      },
    },
    {
      id: "var_cot_u",
      title: "Cotton / Unstitched",
      sku: "NG-P16-COT-U",
      inventory_quantity: 5,
      allow_backorder: false,
      manage_inventory: true,
      options: [
        { option_id: "opt_fabric", value: "Cotton" },
        { option_id: "opt_type", value: "Unstitched" },
      ],
      calculated_price: {
        calculated_amount: 2499,
        original_amount: 2499,
        currency_code: "inr",
      },
    },
  ],
};

const disabledAddToCartButton = (html) =>
  /<button[^>]*type="submit"[^>]*\bdisabled\b[^>]*>/.test(html);

for (const initialVariantId of [
  "var_ray_u",
  "var_ray_s",
  "var_cot_u",
]) {
  test(`renders an enabled "Add to bag" button in the SSR HTML for in-stock variant ${initialVariantId}`, () => {
    const result = svelteServer.render(pickerMod.default, {
      props: { product: p16Product, initialVariantId },
    });

    assert.equal(
      disabledAddToCartButton(result.body),
      false,
      `expected the submit button to be enabled for ${initialVariantId}, got:\n${result.body}`,
    );
    assert.match(result.body, />\s*Add to bag\s*</);
    assert.doesNotMatch(result.body, /Sold out/);
  });
}

test('renders a disabled, "Sold out" button for a variant with zero tracked stock', () => {
  const soldOutProduct = {
    ...p16Product,
    variants: [
      { ...p16Product.variants[0], inventory_quantity: 0 },
      ...p16Product.variants.slice(1),
    ],
  };

  const result = svelteServer.render(pickerMod.default, {
    props: { product: soldOutProduct, initialVariantId: "var_ray_u" },
  });

  assert.equal(disabledAddToCartButton(result.body), true);
  assert.match(result.body, /Sold out/);
});
