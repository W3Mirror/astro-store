import type { APIRoute } from "astro";
import { getProducts } from "../utils/medusa";
import { getSiteConfig } from "../utils/site-config";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'\"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[char] || char,
  );

export const GET: APIRoute = async ({ site, url }) => {
  const config = await getSiteConfig();
  if (config.seo?.profile.indexable === false)
    return new Response("", { status: 404 });
  const origin = site?.origin || url.origin;
  const products = (await getProducts({ limit: 500 })).filter(
    (product) => product !== null,
  );
  const paths = [
    "/",
    "/about",
    ...(config.seo?.profile.faqs.length ? ["/faq"] : []),
    ...products.map((product) => `/products/${product.handle}`),
  ];
  const entries = paths
    .map(
      (path) =>
        `<url><loc>${escapeXml(new URL(path, origin).toString())}</loc></url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
};
