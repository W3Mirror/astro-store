import { SiteConfigOverlayResult } from "./schemas";
import { config } from "./config";

// The effective, per-request store configuration: env-based defaults
// (`config.storeName`, `config.announcementMessage`) overlaid with values
// from the per-project site-config endpoint (`PUBLIC_SITE_CONFIG_URL`),
// when set and reachable. `heroHeading`/`heroSubheading` have no env-based
// equivalent — they're empty unless the overlay supplies them.
export interface SiteConfig {
  storeName: string;
  announcementMessage: string;
  heroHeading: string;
  heroSubheading: string;
}

const TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 3_000;

let cached: { value: SiteConfig; expiresAt: number } | null = null;
let inFlight: Promise<SiteConfig> | null = null;

const envDefaults = (): SiteConfig => ({
  storeName: config.storeName,
  announcementMessage: config.announcementMessage,
  heroHeading: "",
  heroSubheading: "",
});

// Fetches the public site-config JSON and overlays it on the env-based
// defaults. Any failure (network error, timeout, non-2xx, bad JSON, schema
// mismatch) falls back to the env defaults exactly — never throws.
const fetchSiteConfig = async (): Promise<SiteConfig> => {
  const defaults = envDefaults();

  try {
    const response = await fetch(config.siteConfigUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return defaults;

    const overlay = SiteConfigOverlayResult.parse(await response.json());

    return {
      storeName: overlay.storeName || defaults.storeName,
      announcementMessage:
        overlay.announcementMessage ?? defaults.announcementMessage,
      heroHeading: overlay.heroHeading || defaults.heroHeading,
      heroSubheading: overlay.heroSubheading || defaults.heroSubheading,
    };
  } catch {
    return defaults;
  }
};

// Returns the effective site config for the current request, backed by a
// short in-memory TTL cache (module-scoped, so it's shared across the
// components rendered within/across requests on the same server instance)
// to avoid re-fetching on every component that reads it.
export const getSiteConfig = async (): Promise<SiteConfig> => {
  if (!config.siteConfigUrl) return envDefaults();

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (inFlight) return inFlight;

  inFlight = fetchSiteConfig().then((value) => {
    cached = { value, expiresAt: Date.now() + TTL_MS };
    inFlight = null;
    return value;
  });

  return inFlight;
};
