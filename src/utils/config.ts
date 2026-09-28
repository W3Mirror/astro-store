import storeJson from "../../.agents/w3dev/store.json";
import { configSchema } from "./schemas";
import { parseStoreContract, resolveStoreInputs } from "./store-contract.js";

// Resolution: env var (when non-empty) → `.agents/w3dev/store.json` →
// the schema's defaults. See `utils/store-contract.js`. The `PUBLIC_*`
// reads stay literal `import.meta.env.X` accesses so Vite inlines them.
const publishableKeyEnv = import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY;
const storeInputs = resolveStoreInputs(
  {
    PUBLIC_MEDUSA_BACKEND_URL: import.meta.env.PUBLIC_MEDUSA_BACKEND_URL,
    PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableKeyEnv,
    PUBLIC_MEDUSA_REGION_ID: import.meta.env.PUBLIC_MEDUSA_REGION_ID,
    PUBLIC_STORE_NAME: import.meta.env.PUBLIC_STORE_NAME,
    PUBLIC_SITE_CONFIG_URL: import.meta.env.PUBLIC_SITE_CONFIG_URL,
    // Set at config time by the `storeContract` Vite plugin; absent when
    // this module is loaded without it (e.g. the node:test Vite servers).
    STORE_ENVIRONMENT:
      typeof __W3DEV_STORE_ENVIRONMENT__ === "undefined"
        ? undefined
        : __W3DEV_STORE_ENVIRONMENT__,
    PUBLIC_STORE_ENVIRONMENT: import.meta.env.PUBLIC_STORE_ENVIRONMENT,
  },
  parseStoreContract(storeJson),
);

const defineConfig = {
  medusaBackendUrl: storeInputs.medusaBackendUrl,
  medusaPublishableKey: storeInputs.medusaPublishableKey,
  medusaRegionId: storeInputs.medusaRegionId,
  storeName: storeInputs.storeName,
  announcementMessage: import.meta.env.PUBLIC_ANNOUNCEMENT_MESSAGE,
  siteConfigUrl: storeInputs.siteConfigUrl,
  customerEngagementEnabled:
    import.meta.env.PUBLIC_CUSTOMER_ENGAGEMENT_ENABLED === "true",
  recommendationsEnabled:
    import.meta.env.PUBLIC_RECOMMENDATIONS_ENABLED === "true",
  storeEnvironment: storeInputs.storeEnvironment,
  defaultCountry: storeInputs.defaultCountry,
};

export const config = configSchema.parse(defineConfig);
