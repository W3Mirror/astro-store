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
//
// Falling back is intentional (a storefront should stay up even if the
// config endpoint is down), but doing so *silently* turns a misconfigured
// or unreachable `PUBLIC_SITE_CONFIG_URL` into an invisible failure — the
// storefront just quietly renders defaults (no hero, generic store name)
// forever, with nothing in the logs to explain why. Log every fallback
// path so a bad URL/outage is diagnosable from server logs instead of
// looking like "the feature doesn't work".
const fetchSiteConfig = async (): Promise<SiteConfig> => {
  const defaults = envDefaults();

  try {
    const response = await fetch(config.siteConfigUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[site-config] GET ${config.siteConfigUrl} returned ${response.status}; falling back to env defaults.`
      );
      return defaults;
    }

    const overlay = SiteConfigOverlayResult.parse(await response.json());

    return {
      storeName: overlay.storeName || defaults.storeName,
      announcementMessage:
        overlay.announcementMessage ?? defaults.announcementMessage,
      heroHeading: overlay.heroHeading || defaults.heroHeading,
      heroSubheading: overlay.heroSubheading || defaults.heroSubheading,
    };
  } catch (error) {
    console.error(
      `[site-config] Failed to fetch/parse ${config.siteConfigUrl}; falling back to env defaults.`,
      error
    );
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
