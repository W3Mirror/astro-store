import type { SeoConfig, SiteConfig } from "./site-config";

export function getHomepageSeo(siteConfig: SiteConfig) {
  return {
    title: siteConfig.seo?.profile.homeTitle || siteConfig.storeName,
    description:
      siteConfig.seo?.profile.homeDescription ||
      `Shop online at ${siteConfig.storeName}.`,
    image: siteConfig.seo?.profile.socialImage || undefined,
  };
}

export function getProductSeo(
  seo: SeoConfig | null,
  product: {
    id: string;
    handle: string;
    title: string;
    description?: string | null;
  },
  storeName: string,
) {
  const saved = seo?.productMetadata.find(
    (entry) =>
      entry.productId === product.id || entry.handle === product.handle,
  );
  return {
    title: saved?.title || `${product.title} | ${storeName}`,
    description:
      saved?.description ||
      product.description?.slice(0, 180) ||
      `Shop ${product.title} from ${storeName}.`,
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
