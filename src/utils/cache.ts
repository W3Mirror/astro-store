import type { AstroGlobal } from "astro";
import { config } from "./config";

// Vercel's edge cache sits in front of every request to this deployment and,
// absent an edge-specific directive, inherits the same `max-age` given to
// the browser below. That's why a publish/alias switch could leave the edge
// serving a stale page for as long as the browser TTL (up to ~180s with the
// previous stale-while-revalidate window) even though the new deployment was
// already live. `Vercel-CDN-Cache-Control` lets Vercel's edge use its own,
// much shorter TTL while the `Cache-Control` value below keeps controlling
// the browser exactly as before. Neither other CDNs nor the browser read
// `Vercel-CDN-Cache-Control` — see
// https://vercel.com/docs/caching/cdn-cache#cdn-cache-control.
const EDGE_CACHE_CONTROL = "public, s-maxage=5, stale-while-revalidate=30";

// Best-effort per-store tag for `Vercel-Cache-Tag`
// (https://vercel.com/docs/caching/cdn-cache/purge#cache-tags), so a future
// purge-by-tag can target one store without affecting others sharing the
// same Vercel team. Every published store's `PUBLIC_SITE_CONFIG_URL` points
// at `/api/public/site-config/<projectId>` (see `utils/site-config.ts`), so
// the trailing path segment doubles as a stable store id. Falls back to
// `undefined` (no store tag emitted) for local dev or a store that hasn't
// set `PUBLIC_SITE_CONFIG_URL`, since cache tags are purely additive and
// nothing reads them yet.
const deriveStoreCacheTag = (): string | undefined => {
  if (!config.siteConfigUrl) return undefined;
  try {
    const segments = new URL(config.siteConfigUrl).pathname
      .split("/")
      .filter(Boolean);
    const projectId = segments.at(-1);
    return projectId ? `store:${projectId}` : undefined;
  } catch {
    return undefined;
  }
};

const storeCacheTag = deriveStoreCacheTag();

// Cache tags must not contain commas (the header's own delimiter) — see the
// Vercel docs linked above. Strip any that sneak in from a page-supplied tag
// (e.g. built from a product handle) rather than corrupting the header.
const sanitizeTag = (tag: string) => tag.replace(/,/g, "");

const applyEdgeHeaders = (
  Astro: AstroGlobal,
  browserCacheControl: string,
  tags: string[],
) => {
  Astro.response.headers.set("Cache-Control", browserCacheControl);
  Astro.response.headers.set("Vercel-CDN-Cache-Control", EDGE_CACHE_CONTROL);

  const allTags = [storeCacheTag, ...tags].filter(Boolean) as string[];
  if (allTags.length > 0) {
    Astro.response.headers.set(
      "Vercel-Cache-Tag",
      allTags.map(sanitizeTag).join(","),
    );
  }
};

export const setCache = {
  // `tags` are additional, page-specific cache tags (e.g. `product:<handle>`)
  // appended to the per-store tag above.
  long: (Astro: AstroGlobal, tags: string[] = []) => {
    applyEdgeHeaders(
      Astro,
      "public, max-age=60, stale-while-revalidate=120",
      tags,
    );
  },

  short: (Astro: AstroGlobal, tags: string[] = []) => {
    applyEdgeHeaders(
      Astro,
      "public, max-age=1, stale-while-revalidate=9",
      tags,
    );
  },
};
