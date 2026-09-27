import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Store branding — logo, favicon, hero image, about image, and collection
// banners — sourced from the per-environment site-config overlay (see the
// parent repo's `schema-site-config.ts` module doc). Mirrors this file's
// sibling contract tests: lightweight source-text assertions, no Astro
// render harness.

test("SiteConfigOverlayResult accepts the five branding fields", async () => {
  const schemas = await read("src/utils/schemas.ts");
  for (const field of [
    "logoUrl",
    "faviconUrl",
    "heroImageUrl",
    "heroImageAlt",
    "aboutImageUrl",
  ]) {
    assert.match(
      schemas,
      new RegExp(`${field}:\\s*z\\.string\\(\\)\\.nullable\\(\\)\\.optional\\(\\)`),
    );
  }
});

test("getSiteConfig overlays branding fields onto env defaults, defaulting to null", async () => {
  const siteConfig = await read("src/utils/site-config.ts");
  assert.match(siteConfig, /logoUrl: string \| null;/);
  assert.match(siteConfig, /faviconUrl: string \| null;/);
  assert.match(siteConfig, /heroImageUrl: string \| null;/);
  assert.match(siteConfig, /heroImageAlt: string \| null;/);
  assert.match(siteConfig, /aboutImageUrl: string \| null;/);
  assert.match(siteConfig, /logoUrl: overlay\.logoUrl \|\| defaults\.logoUrl/);
  assert.match(
    siteConfig,
    /aboutImageUrl: overlay\.aboutImageUrl \|\| defaults\.aboutImageUrl/,
  );
});

test("the header renders the logo image when set, falling back to the store name", async () => {
  const header = await read("src/components/Header.astro");
  assert.match(header, /siteConfig\.logoUrl/);
  assert.match(header, /<ResponsiveImage/);
  assert.match(header, /\{siteConfig\.storeName\}/);
});

test("BaseLayout renders a custom favicon when set, falling back to /favicon.svg", async () => {
  const layout = await read("src/layouts/BaseLayout.astro");
  assert.match(layout, /siteConfig\.faviconUrl/);
  assert.match(layout, /href="\/favicon\.svg"/);
});

test("the home hero renders heroImageUrl/heroImageAlt", async () => {
  const hero = await read("src/components/Hero.astro");
  const home = await read("src/pages/index.astro");
  assert.match(hero, /imageUrl/);
  assert.match(hero, /imageAlt/);
  assert.match(home, /imageUrl=\{siteConfig\.heroImageUrl\}/);
  assert.match(home, /imageAlt=\{siteConfig\.heroImageAlt\}/);
});

test("the about page renders aboutImageUrl", async () => {
  const about = await read("src/pages/about.astro");
  assert.match(about, /siteConfig\.aboutImageUrl/);
  assert.match(about, /<ResponsiveImage/);
});

test("collection banners: CategoryResult exposes bannerImageUrl/bannerImageAlt from metadata", async () => {
  const schemas = await read("src/utils/schemas.ts");
  assert.match(schemas, /banner_image_url/);
  assert.match(schemas, /banner_image_alt/);
  assert.match(schemas, /bannerImageUrl:/);
  assert.match(schemas, /bannerImageAlt:/);
});

test("the collection page renders a banner image when the collection has one", async () => {
  const page = await read("src/pages/collections/[handle].astro");
  assert.match(page, /collection\.bannerImageUrl/);
  assert.match(page, /collection\.bannerImageAlt/);
  assert.match(page, /<ResponsiveImage/);
});
