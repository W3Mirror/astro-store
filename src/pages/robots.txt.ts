import type { APIRoute } from "astro";
import { getSiteConfig } from "../utils/site-config";
import { config as buildConfig } from "../utils/config";

export const GET: APIRoute = async ({ site, url }) => {
  const config = await getSiteConfig();
  const origin = site?.origin || url.origin;
  // A test-environment build always disallows crawling, regardless of the
  // live storefront's remote SEO review status.
  const allowed =
    buildConfig.storeEnvironment !== "test" &&
    config.seo?.profile.indexable !== false;
  const body = allowed
    ? `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nSitemap: ${origin}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
