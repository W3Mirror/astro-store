import type { SiteConfig } from "./site-config";

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
  product: {
    id: string;
    handle: string;
    title: string;
    description?: string | null;
  },
  storeName: string,
) {
  return {
    title: `${product.title} | ${storeName}`,
    description:
      product.description?.slice(0, 180) ||
      `Shop ${product.title} from ${storeName}.`,
  };
}
