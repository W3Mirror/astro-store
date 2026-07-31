import type { APIRoute } from "astro";
import { getProducts } from "../utils/medusa";
import { getSiteConfig } from "../utils/site-config";

const clean = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export const GET: APIRoute = async ({ site, url }) => {
  const config = await getSiteConfig();
  const origin = site?.origin || url.origin;
  const products = (await getProducts({ limit: 100 })).filter(
    (product) => product !== null,
  );
  const lines = [
    `# ${clean(config.seo?.profile.organizationName || config.storeName)}`,
    "",
    `> ${clean(config.seo?.profile.organizationDescription || `Online store for ${config.storeName}.`)}`,
    "",
    `- About: ${origin}/about`,
    ...(config.seo?.profile.faqs.length
      ? [`- Frequently asked questions: ${origin}/faq`]
      : []),
    "",
    "## Products",
    ...products.map(
      (product) =>
        `- [${clean(product.title)}](${origin}/products/${product.handle}): ${clean(product.description || "Product details and availability.")}`,
    ),
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
