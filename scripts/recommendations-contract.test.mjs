import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("recommendation signal mutations stay same-origin and server-forwarded", async () => {
  const [route, schemas] = await Promise.all([
    read("src/pages/api/recommendations/signal.ts"),
    read("src/utils/schemas.ts"),
  ]);
  assert.match(route, /rejectCrossOriginAccountMutation\(request\)/);
  assert.match(route, /RecommendationSignalInput\.safeParse/);
  assert.match(route, /PUBLIC_RECOMMENDATIONS_ENABLED|recommendationsEnabled/);
  assert.match(route, /\/store\/recommendations\/signals/);
  assert.doesNotMatch(route, /Authorization/);
  assert.match(schemas, /RecommendationSignalInput[\s\S]*\.max\(20\)/);
});

test("storefront renders reasons and explicitly applies active promotions", async () => {
  const [shelf, button, medusa] = await Promise.all([
    read("src/components/ProductRecommendations.astro"),
    read("src/components/RecommendationAddButton.svelte"),
    read("src/utils/medusa.ts"),
  ]);
  assert.match(shelf, /recommendation\.reasons/);
  assert.match(button, /promotionCode/);
  assert.match(medusa, /\/store\/carts\/\$\{cartId\}\/promotions/);
});

test("view and cart signals use pseudonymous local actors and idempotency keys", async () => {
  const [actor, view, cart] = await Promise.all([
    read("src/utils/recommendation-actor.ts"),
    read("src/components/RecommendationSignal.svelte"),
    read("src/stores/cart.ts"),
  ]);
  assert.match(actor, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(actor, /email|phone|customer/);
  assert.match(view, /idempotency_key/);
  assert.match(cart, /idempotency_key/);
  assert.match(cart, /related_product_ids/);
});
