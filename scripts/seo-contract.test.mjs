import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("base layout emits canonical, social, robots, and structured metadata", async () => {
  const source = await read("src/layouts/BaseLayout.astro");
  for (const contract of [
    'rel="canonical"',
    'property="og:title"',
    'name="twitter:card"',
    'name="robots"',
    'type="application/ld+json"',
  ]) {
    assert.match(
      source,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("storefront has discoverability endpoints and visible answer surfaces", async () => {
  const files = await Promise.all([
    read("src/pages/robots.txt.ts"),
    read("src/pages/sitemap.xml.ts"),
    read("src/pages/llms.txt.ts"),
    read("src/pages/about.astro"),
    read("src/pages/faq.astro"),
  ]);
  assert.match(files[0], /Sitemap:/);
  assert.match(files[1], /products/);
  assert.match(files[2], /## Products/);
  assert.match(files[3], /profile\.about/);
  assert.match(files[4], /FAQPage/);
});

test("SEO additions preserve deferred cart hydration", async () => {
  const layout = await read("src/layouts/BaseLayout.astro");
  assert.match(layout, /<CartDrawer client:idle \/>/);
  assert.doesNotMatch(layout, /client:load/);
});
