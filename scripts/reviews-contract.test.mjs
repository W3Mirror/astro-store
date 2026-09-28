import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// P0-5: no visible dead/placeholder-sounding review copy ships to
// customers until reviews are actually wired up — see the reference
// analysis, item C5.

test("ProductReviews no longer renders the 'not available on this storefront' placeholder", async () => {
  const reviews = await read("src/components/ProductReviews.astro");
  assert.doesNotMatch(reviews, /not available on this storefront/i);
  assert.doesNotMatch(reviews, /Customer Reviews/);
});
