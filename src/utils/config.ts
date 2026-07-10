import { configSchema } from "./schemas";

const defineConfig = {
  medusaBackendUrl: import.meta.env.PUBLIC_MEDUSA_BACKEND_URL,
  medusaPublishableKey: import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  medusaRegionId: import.meta.env.PUBLIC_MEDUSA_REGION_ID,
  stripePublishableKey: import.meta.env.PUBLIC_STRIPE_KEY,
};

export const config = configSchema.parse(defineConfig);
