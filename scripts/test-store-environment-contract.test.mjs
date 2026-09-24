import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("config schema and env wiring carry storeEnvironment", async () => {
  const [schemas, config, envExample] = await Promise.all([
    read("src/utils/schemas.ts"),
    read("src/utils/config.ts"),
    read(".env.example"),
  ]);
  assert.match(schemas, /storeEnvironment:\s*z\.preprocess\(/);
  assert.match(schemas, /z\.enum\(\["live", "test"\]\)/);
  // The preprocess step is what makes an empty-string env value (as
  // `.env.example` ships `PUBLIC_STORE_ENVIRONMENT=`) behave like unset
  // instead of throwing — guard against that regressing silently.
  assert.match(schemas, /v === "" \? undefined : v/);
  assert.match(config, /PUBLIC_STORE_ENVIRONMENT/);
  assert.match(envExample, /PUBLIC_STORE_ENVIRONMENT/);
});

test("middleware sets X-Robots-Tag only for the test build", async () => {
  const source = await read("src/middleware.ts");
  assert.match(source, /defineMiddleware/);
  assert.match(source, /storeEnvironment === "test"/);
  assert.match(source, /X-Robots-Tag/);
  assert.match(source, /noindex, nofollow/);
});

test("robots.txt disallows everything for the test build regardless of the remote overlay", async () => {
  const source = await read("src/pages/robots.txt.ts");
  assert.match(source, /buildConfig\.storeEnvironment !== "test"/);
  assert.match(source, /Disallow: \//);
});

test("BaseLayout forces noindex and renders the test-store banner", async () => {
  const source = await read("src/layouts/BaseLayout.astro");
  assert.match(source, /config\.storeEnvironment === "test"/);
  assert.match(source, /<TestStoreBanner/);
});

test("TestStoreBanner only renders in the test build and is accessible", async () => {
  const source = await read("src/components/TestStoreBanner.astro");
  assert.match(source, /storeEnvironment === "test"/);
  assert.match(source, /orders aren't real/i);
  assert.match(source, /role="status"/);
});

test("DEPLOY.md documents PUBLIC_STORE_ENVIRONMENT and the live build stays unset", async () => {
  const source = await read("DEPLOY.md");
  assert.match(source, /PUBLIC_STORE_ENVIRONMENT/);
  assert.match(source, /live build must never set it/);
});
