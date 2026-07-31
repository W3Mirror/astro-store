import { configSchema } from "./schemas";

const defineConfig = {
  medusaBackendUrl: import.meta.env.PUBLIC_MEDUSA_BACKEND_URL,
  medusaPublishableKey: import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  medusaRegionId: import.meta.env.PUBLIC_MEDUSA_REGION_ID,
  stripePublishableKey: import.meta.env.PUBLIC_STRIPE_KEY,
  storeName: import.meta.env.PUBLIC_STORE_NAME,
  announcementMessage: import.meta.env.PUBLIC_ANNOUNCEMENT_MESSAGE,
  siteConfigUrl: import.meta.env.PUBLIC_SITE_CONFIG_URL,
  customerEngagementEnabled:
    import.meta.env.PUBLIC_CUSTOMER_ENGAGEMENT_ENABLED === "true",
  recommendationsEnabled:
    import.meta.env.PUBLIC_RECOMMENDATIONS_ENABLED === "true",
};

export const config = configSchema.parse(defineConfig);
