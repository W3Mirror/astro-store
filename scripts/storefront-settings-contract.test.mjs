import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// New per-environment storefront settings — `whatsapp_number`,
// `size_chart_image_url`, `custom_fit_note`, and `show_test_banner` — all
// sourced from the same per-environment site-config overlay as branding
// fields. Mirrors `branding-contract.test.mjs`'s lightweight
// source-text-assertion style: no Astro render harness.

test("SiteConfigOverlayResult accepts whatsappNumber/sizeChartImageUrl/customFitNote/showTestBanner", async () => {
  const schemas = await read("src/utils/schemas.ts");
  for (const field of [
    "whatsappNumber",
    "sizeChartImageUrl",
    "customFitNote",
  ]) {
    assert.match(
      schemas,
      new RegExp(`${field}:\\s*z\\.string\\(\\)\\.nullable\\(\\)\\.optional\\(\\)`),
    );
  }
  assert.match(
    schemas,
    /showTestBanner:\s*z\.boolean\(\)\.nullable\(\)\.optional\(\)/,
  );
});

test("SiteConfigOverlayResult accepts shippingText/returnsText", async () => {
  const schemas = await read("src/utils/schemas.ts");
  for (const field of ["shippingText", "returnsText"]) {
    assert.match(
      schemas,
      new RegExp(`${field}:\\s*z\\.string\\(\\)\\.nullable\\(\\)\\.optional\\(\\)`),
    );
  }
});

test("getSiteConfig overlays shippingText/returnsText onto env defaults", async () => {
  const siteConfig = await read("src/utils/site-config.ts");
  assert.match(siteConfig, /shippingText: string \| null;/);
  assert.match(siteConfig, /returnsText: string \| null;/);
  assert.match(
    siteConfig,
    /shippingText: overlay\.shippingText \|\| defaults\.shippingText/,
  );
  assert.match(
    siteConfig,
    /returnsText: overlay\.returnsText \|\| defaults\.returnsText/,
  );
});

test("getSiteConfig overlays the new settings onto env defaults", async () => {
  const siteConfig = await read("src/utils/site-config.ts");
  assert.match(siteConfig, /whatsappNumber: string \| null;/);
  assert.match(siteConfig, /sizeChartImageUrl: string \| null;/);
  assert.match(siteConfig, /customFitNote: string \| null;/);
  assert.match(siteConfig, /showTestBanner: boolean;/);
  assert.match(
    siteConfig,
    /whatsappNumber: overlay\.whatsappNumber \|\| defaults\.whatsappNumber/,
  );
  assert.match(
    siteConfig,
    /showTestBanner: overlay\.showTestBanner \?\? defaults\.showTestBanner/,
  );
  // Defaults to shown (`true`), never silently hidden when unset.
  assert.match(siteConfig, /showTestBanner: true,/);
});

test("TestStoreBanner only ever hides on a Test build, never enables the banner on Live", async () => {
  const banner = await read("src/components/TestStoreBanner.astro");
  assert.match(banner, /storeEnvironment === "test"/);
  assert.match(
    banner,
    /showBanner = isTestEnvironment && siteConfig!\.showTestBanner/,
  );
  // The Live branch never calls getSiteConfig for this decision and always
  // evaluates showBanner through isTestEnvironment first (short-circuited).
  assert.match(banner, /isTestEnvironment\s*\?\s*await getSiteConfig\(\)\s*:\s*null/);
});
