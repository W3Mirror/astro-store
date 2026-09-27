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
  // Branding images/alt text. `null` (not empty string) when unset, so
  // callers can tell "no logo configured" apart from "configured as empty"
  // and fall back to sensible defaults (the store name, no hero image, ...).
  logoUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  aboutImageUrl: string | null;
  seo: SeoConfig | null;
}

export interface SeoConfig {
  profile: {
    homeTitle: string;
    homeDescription: string;
    organizationName: string;
    organizationDescription: string;
    about: string;
    faqs: { question: string; answer: string }[];
    socialImage: string;
    indexable: boolean;
  };
}

const TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 3_000;

// Best-effort host extraction for log lines. `siteConfigUrl` is a plain,
// unvalidated string (see `configSchema`), so a misconfigured value (e.g.
// an empty string reaching here, a bare hostname, or a typo'd scheme) must
// never throw out of a log statement — fall back to the raw value so the
// log line still points at whatever was actually configured.
const describeSiteConfigUrl = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url || "(empty)";
  }
};

let cached: { value: SiteConfig; expiresAt: number } | null = null;
let inFlight: Promise<SiteConfig> | null = null;

const envDefaults = (): SiteConfig => ({
  storeName: config.storeName,
  announcementMessage: config.announcementMessage,
  heroHeading: "",
  heroSubheading: "",
  logoUrl: null,
  faviconUrl: null,
  heroImageUrl: null,
  heroImageAlt: null,
  aboutImageUrl: null,
  seo: null,
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
        `[site-config] GET host=${describeSiteConfigUrl(config.siteConfigUrl)} status=${response.status}; falling back to env defaults.`,
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
      logoUrl: overlay.logoUrl || defaults.logoUrl,
      faviconUrl: overlay.faviconUrl || defaults.faviconUrl,
      heroImageUrl: overlay.heroImageUrl || defaults.heroImageUrl,
      heroImageAlt: overlay.heroImageAlt || defaults.heroImageAlt,
      aboutImageUrl: overlay.aboutImageUrl || defaults.aboutImageUrl,
      seo:
        overlay.seo?.reviewStatus === "approved"
          ? {
              profile: overlay.seo.profile,
            }
          : null,
    };
  } catch (error) {
    console.error(
      `[site-config] Failed to fetch/parse host=${describeSiteConfigUrl(config.siteConfigUrl)}; falling back to env defaults.`,
      error,
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
