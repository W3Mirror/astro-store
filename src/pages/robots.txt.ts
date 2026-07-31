import type { APIRoute } from "astro";
import { getSiteConfig } from "../utils/site-config";

export const GET: APIRoute = async ({ site, url }) => {
  const config = await getSiteConfig();
  const origin = site?.origin || url.origin;
  const allowed = config.seo?.profile.indexable !== false;
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
