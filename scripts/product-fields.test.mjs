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
