import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rejectCrossOriginAccountMutation } from "../src/utils/account-mutation-security.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const mutationRequest = (headers = {}) =>
  new Request("https://shop.example.com/api/account/login", {
    method: "POST",
    headers,
  });

test("accepts same-origin account mutations", () => {
  assert.equal(
    rejectCrossOriginAccountMutation(
      mutationRequest({ Origin: "https://shop.example.com" }),
    ),
    null,
  );
  assert.equal(
    rejectCrossOriginAccountMutation(
      mutationRequest({ "Sec-Fetch-Site": "same-origin" }),
    ),
    null,
  );
});

test("rejects cross-origin and same-site sibling account mutations", () => {
  for (const origin of [
    "https://attacker.example.net",
    "https://admin.example.com",
  ]) {
    assert.equal(
      rejectCrossOriginAccountMutation(
        mutationRequest({
          Origin: origin,
          "Sec-Fetch-Site": "same-origin",
        }),
      )?.status,
      403,
    );
  }
});

test("fails closed for malformed Origin or missing fetch metadata", () => {
  for (const origin of ["not a url", "https://shop.example.com/path"]) {
    assert.equal(
      rejectCrossOriginAccountMutation(mutationRequest({ Origin: origin }))
        ?.status,
      403,
    );
  }
  assert.equal(
    rejectCrossOriginAccountMutation(mutationRequest())?.status,
    403,
  );
  for (const site of ["same-site", "cross-site", "none", "invalid"]) {
    assert.equal(
      rejectCrossOriginAccountMutation(
        mutationRequest({ "Sec-Fetch-Site": site }),
      )?.status,
      403,
    );
  }
});

test("guards every account POST route before parsing or side effects", async () => {
  const routes = [
    "src/pages/api/account/login.ts",
    "src/pages/api/account/register.ts",
    "src/pages/api/account/logout.ts",
    "src/pages/api/account/profile.ts",
    "src/pages/api/account/address.ts",
    "src/pages/api/account/addresses/[id].ts",
    "src/pages/api/account/consent.ts",
    "src/pages/api/account/wishlist.ts",
  ];

  for (const route of routes) {
    const source = await read(route);
    const handler = source.slice(source.indexOf("export const POST"));
    const guard = handler.indexOf("rejectCrossOriginAccountMutation(request)");
    assert.notEqual(guard, -1, `${route} must enforce same-origin mutations`);
    for (const sideEffect of [
      "request.formData()",
      "getCustomerToken(cookies)",
      "clearCustomerToken(cookies)",
      "customerRequest(",
    ]) {
      const position = handler.indexOf(sideEffect);
      if (position !== -1) {
        assert.ok(guard < position, `${route} must guard before ${sideEffect}`);
      }
    }
  }
});

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
