import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("hydrates cart UI after the first paint", async () => {
  const header = await read("src/components/Header.astro");
  const layout = await read("src/layouts/BaseLayout.astro");

  assert.match(header, /<CartIcon client:idle \/>/);
  assert.match(layout, /<CartDrawer client:idle \/>/);
  assert.doesNotMatch(header, /CartIcon client:load/);
});

test("prioritizes only the first catalog image", async () => {
  const products = await read("src/components/Products.astro");
  const card = await read("src/components/ProductCard.astro");

  assert.match(products, /priority=\{index === 0\}/);
  assert.match(card, /loading=\{priority \? "eager" : "lazy"\}/);
  assert.match(card, /fetchpriority=\{priority \? "high" : "auto"\}/);
});

test("keeps the home response edge-cacheable", async () => {
  const home = await read("src/pages/index.astro");
  const cache = await read("src/utils/cache.ts");

  assert.match(home, /setCache\.long\(Astro\)/);
  assert.match(cache, /public, max-age=60, stale-while-revalidate=120/);
});

test("ships all three launch presets through the public config contract", async () => {
  const presets = await read("src/utils/store-presets.ts");
  const schema = await read("src/utils/schemas.ts");
  const layout = await read("src/layouts/BaseLayout.astro");

  for (const preset of ["minimal", "editorial", "conversion"]) {
    assert.match(presets, new RegExp(`"${preset}"`));
  }
  assert.match(schema, /storefrontPreset: z\.enum\(storefrontPresets\)/);
  assert.match(
    layout,
    /data-storefront-preset=\{siteConfig\.storefrontPreset\}/,
  );
});
