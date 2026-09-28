import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Medusa treats an unprefixed `fields` entry as "select ONLY these", which
// drops default columns such as `title` and `handle` and makes every product
// fail schema validation (all product pages 500). Every entry must extend the
// defaults with `+` or `*`.
test("PRODUCT_FIELDS only extends the default field set", () => {
  const src = readFileSync(new URL("../src/utils/medusa.ts", import.meta.url), "utf8");
  const match = src.match(/const PRODUCT_FIELDS =\s*"([^"]+)"/);
  assert.ok(match, "PRODUCT_FIELDS constant not found");
  const unprefixed = match[1].split(",").filter((f) => !/^[+*]/.test(f.trim()));
  assert.deepEqual(unprefixed, []);
});

// The PDP "Fabric & Care" accordion reads product.metadata.fabric_care, so the
// Store API query must request it and the schema must keep it.
test("product metadata is requested and kept by the schema", () => {
  const medusa = readFileSync(new URL("../src/utils/medusa.ts", import.meta.url), "utf8");
  const fields = medusa.match(/const PRODUCT_FIELDS =\s*"([^"]+)"/)[1].split(",");
  assert.ok(fields.includes("+metadata"), "PRODUCT_FIELDS must include +metadata");
  const schemas = readFileSync(new URL("../src/utils/schemas.ts", import.meta.url), "utf8");
  const product = schemas.slice(schemas.indexOf("export const ProductResult"), schemas.indexOf("export const ProductResult") + 2500);
  assert.match(product, /\n    metadata: z\.record/);
});
