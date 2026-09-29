import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  STORE_CONTRACT_PATH,
  parseStoreContract,
  pickValue,
  resolveStoreEnvironment,
  resolveStoreInputs,
} from "../src/utils/store-contract.js";
import {
  readStoreContract,
  storeContract,
} from "../src/utils/store-contract-vite.mjs";

// STORE CONTRACT (`.agents/w3dev/store.json`, see `src/utils/store-contract.js`):
// env (non-empty) wins → store.json (non-empty) → the schema's defaults.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const EMPTY = {
  version: 1,
  scripts: { build: "build:vercel", preview: "preview:dev" },
  output: ".vercel/output",
  features: { siteConfig: true, testSite: true },
  medusa: {
    backendUrl: "",
    publishableKey: "",
    testPublishableKey: "",
    regionId: "",
    defaultCountry: "",
  },
  store: { name: "" },
  siteConfigUrl: "",
};

const FILLED = {
  ...EMPTY,
  medusa: {
    backendUrl: "https://json-backend.example/",
    publishableKey: "pk_json123",
    testPublishableKey: "pk_jsontest789",
    regionId: "reg_json123",
    defaultCountry: "in",
  },
  store: { name: "Json Store" },
  siteConfigUrl: "https://builder.example/api/public/site-config/p1",
};

const PLATFORM_ENV = {
  PUBLIC_MEDUSA_BACKEND_URL: "https://env-backend.example",
  PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_env456",
  PUBLIC_MEDUSA_REGION_ID: "reg_env456",
  PUBLIC_STORE_NAME: "Env Store",
  PUBLIC_SITE_CONFIG_URL: "https://builder.example/api/public/site-config/p2",
};

test("store.json ships with exactly the contract keys and empty values", async () => {
  const json = JSON.parse(await read(STORE_CONTRACT_PATH));
  assert.deepEqual(json, EMPTY);
  assert.deepEqual(Object.keys(json), Object.keys(EMPTY));
  assert.deepEqual(Object.keys(json.medusa), Object.keys(EMPTY.medusa));
  // The environment is env-only — never part of the contract file.
  assert.ok(!("environment" in json) && !("storeEnvironment" in json));
  await read(".agents/w3dev/README.md");
});

test("the contract's scripts exist in package.json", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(
    pkg.scripts["build:vercel"],
    "astro build --config astro.config.vercel.mjs",
  );
  assert.equal(
    pkg.scripts["preview:dev"],
    "astro dev --host --port ${PORT:-3000}",
  );
});

test("empty store.json values parse as unset", () => {
  assert.deepEqual(parseStoreContract(EMPTY), {
    backendUrl: undefined,
    publishableKey: undefined,
    testPublishableKey: undefined,
    regionId: undefined,
    defaultCountry: undefined,
    storeName: undefined,
    siteConfigUrl: undefined,
  });
});

test("filled store.json parses (trailing slash trimmed off the backend URL)", () => {
  assert.deepEqual(parseStoreContract(FILLED), {
    backendUrl: "https://json-backend.example",
    publishableKey: "pk_json123",
    testPublishableKey: "pk_jsontest789",
    regionId: "reg_json123",
    defaultCountry: "in",
    storeName: "Json Store",
    siteConfigUrl: "https://builder.example/api/public/site-config/p1",
  });
});

test("malformed store.json values fail fast with the field name", () => {
  const bad = (patch, field) =>
    assert.throws(
      () => parseStoreContract({ ...FILLED, ...patch }),
      (error) => error.message.includes(field),
    );
  bad({ version: 2 }, "version");
  bad(
    { medusa: { ...FILLED.medusa, backendUrl: "not a url" } },
    "medusa.backendUrl",
  );
  bad(
    { medusa: { ...FILLED.medusa, backendUrl: "ftp://x.example" } },
    "medusa.backendUrl",
  );
  bad(
    { medusa: { ...FILLED.medusa, publishableKey: "sk_secret" } },
    "medusa.publishableKey",
  );
  bad(
    { medusa: { ...FILLED.medusa, testPublishableKey: "sk_secret" } },
    "medusa.testPublishableKey",
  );
  bad(
    { medusa: { ...FILLED.medusa, testPublishableKey: 5 } },
    "medusa.testPublishableKey",
  );
  bad(
    { medusa: { ...FILLED.medusa, regionId: "region-1" } },
    "medusa.regionId",
  );
  bad(
    { medusa: { ...FILLED.medusa, defaultCountry: "IND" } },
    "medusa.defaultCountry",
  );
  bad({ medusa: { ...FILLED.medusa, regionId: 42 } }, "medusa.regionId");
  bad({ store: { name: 7 } }, "store.name");
  bad({ siteConfigUrl: "javascript:alert(1)" }, "siteConfigUrl");
  assert.throws(() => parseStoreContract(null), /JSON object/);
});

test("pickValue: env wins, then contract, then the raw env value", () => {
  assert.equal(pickValue("env", "json"), "env");
  assert.equal(pickValue(undefined, "json"), "json");
  assert.equal(pickValue("", "json"), "json");
  assert.equal(pickValue("", undefined), "");
  assert.equal(pickValue(undefined, undefined), undefined);
  assert.equal(pickValue(undefined, ""), undefined);
});

test("platform env wins over a filled store.json", () => {
  const inputs = resolveStoreInputs(PLATFORM_ENV, parseStoreContract(FILLED));
  assert.equal(inputs.medusaBackendUrl, PLATFORM_ENV.PUBLIC_MEDUSA_BACKEND_URL);
  assert.equal(inputs.medusaPublishableKey, "pk_env456");
  assert.equal(inputs.medusaRegionId, "reg_env456");
  assert.equal(inputs.storeName, "Env Store");
  assert.equal(inputs.siteConfigUrl, PLATFORM_ENV.PUBLIC_SITE_CONFIG_URL);
});

test("platform env + empty store.json is exactly today's env-only input", () => {
  const inputs = resolveStoreInputs(
    { ...PLATFORM_ENV, PUBLIC_STORE_ENVIRONMENT: "test" },
    parseStoreContract(EMPTY),
  );
  assert.deepEqual(inputs, {
    medusaBackendUrl: PLATFORM_ENV.PUBLIC_MEDUSA_BACKEND_URL,
    medusaPublishableKey: PLATFORM_ENV.PUBLIC_MEDUSA_PUBLISHABLE_KEY,
    medusaRegionId: PLATFORM_ENV.PUBLIC_MEDUSA_REGION_ID,
    storeName: PLATFORM_ENV.PUBLIC_STORE_NAME,
    siteConfigUrl: PLATFORM_ENV.PUBLIC_SITE_CONFIG_URL,
    defaultCountry: undefined,
    storeEnvironment: "test",
  });
});

test("env unset → store.json values are used", () => {
  const inputs = resolveStoreInputs({}, parseStoreContract(FILLED));
  assert.equal(inputs.medusaBackendUrl, "https://json-backend.example");
  assert.equal(inputs.medusaPublishableKey, "pk_json123");
  assert.equal(inputs.medusaRegionId, "reg_json123");
  assert.equal(inputs.storeName, "Json Store");
  assert.equal(inputs.siteConfigUrl, FILLED.siteConfigUrl);
  assert.equal(inputs.defaultCountry, "in");
  assert.equal(inputs.storeEnvironment, undefined);
});

test("TEST builds use medusa.testPublishableKey when set", () => {
  const contract = parseStoreContract(FILLED);
  for (const env of [
    { STORE_ENVIRONMENT: "test" },
    { PUBLIC_STORE_ENVIRONMENT: "test" },
    { STORE_ENVIRONMENT: "", PUBLIC_STORE_ENVIRONMENT: "test" },
  ]) {
    const inputs = resolveStoreInputs(env, contract);
    assert.equal(inputs.medusaPublishableKey, "pk_jsontest789");
    assert.equal(inputs.storeEnvironment, "test");
  }
  // LIVE (explicit or unset) never takes the TEST key.
  for (const env of [
    {},
    { STORE_ENVIRONMENT: "live" },
    { STORE_ENVIRONMENT: "live", PUBLIC_STORE_ENVIRONMENT: "test" },
  ]) {
    assert.equal(
      resolveStoreInputs(env, contract).medusaPublishableKey,
      "pk_json123",
    );
  }
});

test("the publishable-key env var wins over the TEST key", () => {
  const inputs = resolveStoreInputs(
    { STORE_ENVIRONMENT: "test", PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_env456" },
    parseStoreContract(FILLED),
  );
  assert.equal(inputs.medusaPublishableKey, "pk_env456");
});

test("a TEST build without medusa.testPublishableKey keeps the LIVE key", () => {
  const contract = parseStoreContract({
    ...FILLED,
    medusa: { ...FILLED.medusa, testPublishableKey: "" },
  });
  assert.equal(contract.testPublishableKey, undefined);
  assert.equal(
    resolveStoreInputs({ STORE_ENVIRONMENT: "test" }, contract)
      .medusaPublishableKey,
    "pk_json123",
  );
  // An older store.json without the key at all parses the same way.
  const { testPublishableKey: _omit, ...legacyMedusa } = FILLED.medusa;
  const legacy = parseStoreContract({ ...FILLED, medusa: legacyMedusa });
  assert.equal(legacy.testPublishableKey, undefined);
  assert.equal(
    resolveStoreInputs({ STORE_ENVIRONMENT: "test" }, legacy)
      .medusaPublishableKey,
    "pk_json123",
  );
});

test("env unset + empty store.json falls through to the schema defaults", () => {
  const inputs = resolveStoreInputs(
    { PUBLIC_STORE_NAME: "" },
    parseStoreContract(EMPTY),
  );
  assert.equal(inputs.medusaBackendUrl, undefined);
  // Today's behavior for an empty env value is preserved verbatim.
  assert.equal(inputs.storeName, "");
  assert.equal(inputs.siteConfigUrl, undefined);
});

test("environment is env-only: STORE_ENVIRONMENT, then PUBLIC_STORE_ENVIRONMENT", () => {
  assert.equal(resolveStoreEnvironment({}), undefined);
  assert.equal(
    resolveStoreEnvironment({ PUBLIC_STORE_ENVIRONMENT: "test" }),
    "test",
  );
  assert.equal(resolveStoreEnvironment({ PUBLIC_STORE_ENVIRONMENT: "" }), "");
  assert.equal(resolveStoreEnvironment({ STORE_ENVIRONMENT: "test" }), "test");
  assert.equal(
    resolveStoreEnvironment({
      STORE_ENVIRONMENT: "live",
      PUBLIC_STORE_ENVIRONMENT: "test",
    }),
    "live",
  );
  assert.equal(
    resolveStoreEnvironment({
      STORE_ENVIRONMENT: "",
      PUBLIC_STORE_ENVIRONMENT: "test",
    }),
    "test",
  );
});

test("config.ts routes the contract values through resolveStoreInputs", async () => {
  const config = await read("src/utils/config.ts");
  assert.match(config, /from "\.\.\/\.\.\/\.agents\/w3dev\/store\.json"/);
  assert.match(config, /resolveStoreInputs\(/);
  for (const name of Object.keys(PLATFORM_ENV)) {
    assert.match(config, new RegExp(`import\\.meta\\.env\\.${name}\\b`));
  }
  assert.match(config, /__W3DEV_STORE_ENVIRONMENT__/);
});

test("both astro configs install the storeContract Vite plugin", async () => {
  for (const file of ["astro.config.mjs", "astro.config.vercel.mjs"]) {
    const source = await read(file);
    assert.match(
      source,
      /storeContract\(\{ root: new URL\("\.", import\.meta\.url\) \}\)/,
    );
  }
});

async function withTempStore(json, fn) {
  const dir = await mkdtemp(join(tmpdir(), "store-contract-"));
  try {
    await mkdir(join(dir, ".agents/w3dev"), { recursive: true });
    await writeFile(join(dir, STORE_CONTRACT_PATH), json);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const defineFor = (dir) =>
  storeContract({ root: dir }).config(
    {},
    { mode: "production", command: "build" },
  ).define.__W3DEV_STORE_ENVIRONMENT__;

test("Vite plugin defines STORE_ENVIRONMENT and validates it", async () => {
  await withTempStore(JSON.stringify(EMPTY), async (dir) => {
    await withEnv({ STORE_ENVIRONMENT: undefined }, () => {
      assert.equal(defineFor(dir), "undefined");
    });
    await withEnv({ STORE_ENVIRONMENT: "test" }, () => {
      assert.equal(defineFor(dir), '"test"');
    });
    await withEnv({ STORE_ENVIRONMENT: "staging" }, () => {
      assert.throws(() => defineFor(dir), /STORE_ENVIRONMENT must be one of/);
    });
  });
});

test("Vite plugin fails fast on a missing or malformed store.json", async () => {
  await withTempStore("{not json", async (dir) => {
    assert.throws(() => readStoreContract(dir), /not valid JSON/);
  });
  await withTempStore(
    JSON.stringify({ ...EMPTY, medusa: { ...EMPTY.medusa, regionId: "x" } }),
    async (dir) => {
      assert.throws(() => defineFor(dir), /medusa\.regionId/);
    },
  );
  assert.throws(
    () => readStoreContract(tmpdir() + "/does-not-exist"),
    /could not be read/,
  );
});
