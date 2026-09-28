// @ts-check
// Vite plugin wiring for the store contract (see `store-contract.js`).
// Used by BOTH `astro.config.mjs` (dev / `preview:dev` / Cloudflare build)
// and `astro.config.vercel.mjs` (`build:vercel`).
//
// It does two things at config time, in Node:
//   1. Reads and validates `.agents/w3dev/store.json`, so a malformed
//      contract fails the build/dev server immediately with a clear error.
//      (The storefront itself imports the JSON statically — see
//      `utils/config.ts` — so it is bundled into SSR and client code alike.)
//   2. Resolves `STORE_ENVIRONMENT` (process env or `.env*` files for the
//      current mode) and exposes it as the compile-time constant
//      `__W3DEV_STORE_ENVIRONMENT__`. It is not `PUBLIC_`-prefixed, so
//      Vite would otherwise not expose it to client bundles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { STORE_CONTRACT_PATH, parseStoreContract } from "./store-contract.js";

const ENVIRONMENTS = ["live", "test"];

/**
 * @param {string} root project root (absolute path)
 */
export function readStoreContract(root) {
  const path = join(root, STORE_CONTRACT_PATH);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${STORE_CONTRACT_PATH} could not be read at ${path}`, {
      cause: error,
    });
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${STORE_CONTRACT_PATH} is not valid JSON`, {
      cause: error,
    });
  }
  return parseStoreContract(raw);
}

/**
 * @param {{ root: URL | string }} options
 * @returns {import("vite").Plugin}
 */
export function storeContract({ root }) {
  const rootPath = typeof root === "string" ? root : fileURLToPath(root);
  return {
    name: "w3dev-store-contract",
    config(userConfig, { mode }) {
      readStoreContract(rootPath);
      const env = loadEnv(
        mode,
        userConfig.envDir || rootPath,
        "STORE_ENVIRONMENT",
      );
      const value = env.STORE_ENVIRONMENT || undefined;
      if (value !== undefined && !ENVIRONMENTS.includes(value)) {
        throw new Error(
          `STORE_ENVIRONMENT must be one of ${ENVIRONMENTS.join(", ")}, ` +
            `got ${JSON.stringify(value)}`,
        );
      }
      return {
        define: {
          __W3DEV_STORE_ENVIRONMENT__:
            value === undefined ? "undefined" : JSON.stringify(value),
        },
      };
    },
  };
}
