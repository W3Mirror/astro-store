// @ts-check
// STORE CONTRACT — pure helpers (plain JS so the node:test suite in
// `scripts/store-contract.test.mjs` can run them directly, and so the
// astro config files can validate the contract before a build starts).
//
// Every store repo carries `.agents/w3dev/store.json`, written by the w3dev
// platform (never by hand, never by the code tools). It holds the store's
// PUBLIC identity: Medusa backend URL, publishable key, region, default
// country, store name, and the site-config URL.
//
// Each value resolves as:
//   1. the env var (the existing `PUBLIC_*` names) when set to a non-empty
//      string — so every build that injects env today is unchanged;
//   2. else the store.json value, when non-empty (empty string = unset);
//   3. else the raw env value (unset or `""`), which `configSchema` then
//      treats exactly as it always has (its own defaults).
//
// The environment (test vs live) is NOT part of store.json. It stays env
// only: `STORE_ENVIRONMENT` (preferred) → `PUBLIC_STORE_ENVIRONMENT`.

export const STORE_CONTRACT_PATH = ".agents/w3dev/store.json";
export const STORE_CONTRACT_VERSION = 1;

/**
 * @typedef {{
 *   backendUrl?: string,
 *   publishableKey?: string,
 *   regionId?: string,
 *   defaultCountry?: string,
 *   storeName?: string,
 *   siteConfigUrl?: string,
 * }} StoreContractValues
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * @param {string} message
 * @returns {Error}
 */
const contractError = (message) =>
  new Error(`${STORE_CONTRACT_PATH}: ${message}`);

/**
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @param {string} field
 * @returns {string | undefined} trimmed value, or undefined when empty/absent
 */
function optionalString(obj, key, field) {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw contractError(`"${field}" must be a string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * @param {string | undefined} value
 * @param {string} field
 * @returns {string | undefined}
 */
function httpUrl(value, field) {
  if (value === undefined) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw contractError(
      `"${field}" is not a valid URL: ${JSON.stringify(value)}`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw contractError(`"${field}" must be an http(s) URL`);
  }
  return value;
}

/**
 * @param {string | undefined} value
 * @param {RegExp} pattern
 * @param {string} field
 * @param {string} expected
 * @returns {string | undefined}
 */
function matching(value, pattern, field, expected) {
  if (value === undefined) return undefined;
  if (!pattern.test(value)) {
    throw contractError(
      `"${field}" must be ${expected}, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Validate a parsed store.json and return its values, with empty strings
 * normalised to `undefined` (unset). Throws a descriptive Error on any
 * malformed value so a bad contract fails the build instead of shipping.
 *
 * @param {unknown} raw
 * @returns {StoreContractValues}
 */
export function parseStoreContract(raw) {
  if (!isObject(raw)) throw contractError("expected a JSON object");
  if (raw.version !== STORE_CONTRACT_VERSION) {
    throw contractError(
      `unsupported version ${JSON.stringify(raw.version)} ` +
        `(expected ${STORE_CONTRACT_VERSION})`,
    );
  }
  const medusa = raw.medusa ?? {};
  if (!isObject(medusa)) throw contractError(`"medusa" must be an object`);
  const store = raw.store ?? {};
  if (!isObject(store)) throw contractError(`"store" must be an object`);

  const backendUrl = httpUrl(
    optionalString(medusa, "backendUrl", "medusa.backendUrl"),
    "medusa.backendUrl",
  );

  return {
    // Same shape the env var documents: no trailing slash.
    backendUrl: backendUrl?.replace(/\/+$/, ""),
    publishableKey: matching(
      optionalString(medusa, "publishableKey", "medusa.publishableKey"),
      /^pk_[A-Za-z0-9_]+$/,
      "medusa.publishableKey",
      "a Medusa publishable key (pk_...)",
    ),
    regionId: matching(
      optionalString(medusa, "regionId", "medusa.regionId"),
      /^reg_[A-Za-z0-9]+$/,
      "medusa.regionId",
      "a Medusa region id (reg_...)",
    ),
    defaultCountry: matching(
      optionalString(medusa, "defaultCountry", "medusa.defaultCountry"),
      /^[a-z]{2}$/,
      "medusa.defaultCountry",
      "a lowercase ISO 3166-1 alpha-2 code",
    ),
    storeName: optionalString(store, "name", "store.name"),
    siteConfigUrl: httpUrl(
      optionalString(raw, "siteConfigUrl", "siteConfigUrl"),
      "siteConfigUrl",
    ),
  };
}

/**
 * Env (non-empty) → contract value → the raw env value (so `configSchema`
 * applies exactly the defaults it always has for unset / `""`).
 *
 * @param {string | undefined} envValue
 * @param {string | undefined} contractValue
 * @returns {string | undefined}
 */
export function pickValue(envValue, contractValue) {
  if (typeof envValue === "string" && envValue !== "") return envValue;
  if (contractValue !== undefined && contractValue !== "") {
    return contractValue;
  }
  return envValue;
}

/**
 * The test/live switch is env only. `STORE_ENVIRONMENT` (new, preferred)
 * wins when non-empty; otherwise the existing `PUBLIC_STORE_ENVIRONMENT`
 * value is passed through untouched, so its current semantics hold.
 *
 * @param {{ STORE_ENVIRONMENT?: string, PUBLIC_STORE_ENVIRONMENT?: string }} env
 * @returns {string | undefined}
 */
export function resolveStoreEnvironment(env) {
  const preferred = env.STORE_ENVIRONMENT;
  if (typeof preferred === "string" && preferred !== "") return preferred;
  return env.PUBLIC_STORE_ENVIRONMENT;
}

/**
 * @typedef {{
 *   PUBLIC_MEDUSA_BACKEND_URL?: string,
 *   PUBLIC_MEDUSA_PUBLISHABLE_KEY?: string,
 *   PUBLIC_MEDUSA_REGION_ID?: string,
 *   PUBLIC_STORE_NAME?: string,
 *   PUBLIC_SITE_CONFIG_URL?: string,
 *   STORE_ENVIRONMENT?: string,
 *   PUBLIC_STORE_ENVIRONMENT?: string,
 * }} StoreEnv
 */

/**
 * Resolve the contract-backed config inputs (still unparsed — the caller
 * runs them through `configSchema`).
 *
 * @param {StoreEnv} env
 * @param {StoreContractValues} contract
 */
export function resolveStoreInputs(env, contract) {
  return {
    medusaBackendUrl: pickValue(
      env.PUBLIC_MEDUSA_BACKEND_URL,
      contract.backendUrl,
    ),
    medusaPublishableKey: pickValue(
      env.PUBLIC_MEDUSA_PUBLISHABLE_KEY,
      contract.publishableKey,
    ),
    medusaRegionId: pickValue(env.PUBLIC_MEDUSA_REGION_ID, contract.regionId),
    storeName: pickValue(env.PUBLIC_STORE_NAME, contract.storeName),
    siteConfigUrl: pickValue(
      env.PUBLIC_SITE_CONFIG_URL,
      contract.siteConfigUrl,
    ),
    defaultCountry: contract.defaultCountry,
    storeEnvironment: resolveStoreEnvironment(env),
  };
}
