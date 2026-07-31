import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps the Medusa customer token in a secure server cookie", async () => {
  const account = await read("src/utils/customer-account.ts");
  assert.match(account, /httpOnly: true/);
  assert.match(account, /sameSite: "lax"/);
  assert.match(account, /Authorization: `Bearer \$\{options\.token\}`/);
});

test("uses Medusa emailpass registration and customer creation", async () => {
  const register = await read("src/pages/api/account/register.ts");
  assert.match(register, /\/auth\/customer\/emailpass\/register/);
  assert.match(register, /\/store\/customers/);
  assert.match(register, /engagement\/initialize/);
});

test("gates wishlist and engagement behavior for migration-safe rollout", async () => {
  const config = await read("src/utils/config.ts");
  const wishlist = await read("src/pages/api/account/wishlist.ts");
  assert.match(config, /PUBLIC_CUSTOMER_ENGAGEMENT_ENABLED/);
  assert.match(wishlist, /customerEngagementEnabled/);
});

test("provides profile, addresses, orders, and wishlist account routes", async () => {
  const account = await read("src/pages/account/index.astro");
  const wishlist = await read("src/pages/account/wishlist.astro");
  assert.match(account, /\/store\/customers\/me\/addresses/);
  assert.match(account, /\/store\/orders\?limit=50/);
  assert.match(wishlist, /\/store\/customers\/me\/wishlist/);
});
