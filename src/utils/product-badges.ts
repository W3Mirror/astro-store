import type { z } from "zod";
import type { ProductResult, VariantResult } from "./schemas";
import { getDefaultVariant, getVariantAvailability } from "./variant-selection";

type Product = NonNullable<z.infer<typeof ProductResult>>;
type Variant = z.infer<typeof VariantResult>;

// A product card is "new" for this many days after `created_at` — a fixed,
// generic constant, never a per-store setting.
export const NEW_BADGE_WINDOW_DAYS = 30;

export interface ProductBadgeComparePrice {
  amount: number;
  currency_code: string;
}

export interface ProductBadges {
  // No variant on the product is purchasable at all.
  soldOut: boolean;
  // The representative variant (see `getProductBadges`) is discounted.
  sale: boolean;
  // `created_at` falls within `NEW_BADGE_WINDOW_DAYS` of `now`.
  isNew: boolean;
  // Present only when `sale` is true — the struck-through MRP to render
  // alongside the card's normal (already-discounted) price.
  comparePrice?: ProductBadgeComparePrice;
}

// A "Sale" badge/struck MRP is driven by whichever of two sources shows a
// real discount, checked in this order:
//
// 1. `calculated_price.original_amount` (the undiscounted/list price) vs.
//    `calculated_price.calculated_amount` (the final price after any active
//    promotion or price-list discount) — see `CalculatedPriceResult` in
//    `schemas.ts`. This is the same field pair `ProductVariantPicker.svelte`'s
//    own `comparePrice` already reads, and is Medusa's own native mechanism
//    for a real, checkout-affecting discount.
// 2. `variant.metadata.compare_at_price` — a merchant-set, DISPLAY-ONLY
//    "was" price (Shopify-style; see `admin-product-variants.ts`'s doc
//    comment in `web-app/ecomm-ai` for why this is metadata, not a price
//    list). Only consulted when (1) shows no discount, so a real price-list
//    promotion is never masked by a stale merchant-set compare-at value.
//
// Both sources are kept (never just one): (1) covers any future real
// promotion/price-list Medusa itself computes; (2) is what `compare_at_price`
// on `add_product`/`update_product`/`import_products` actually writes today.
export const compareAtPrice = (
  variant: Variant | undefined | null,
): ProductBadgeComparePrice | undefined => {
  const calculated = variant?.calculated_price;
  if (
    calculated &&
    calculated.original_amount !== null &&
    calculated.calculated_amount !== null &&
    calculated.original_amount > calculated.calculated_amount
  ) {
    return {
      amount: calculated.original_amount,
      currency_code: calculated.currency_code || "inr",
    };
  }

  const metadataCompareAt = variant?.metadata?.compare_at_price;
  const currentAmount = calculated?.calculated_amount;
  if (
    typeof metadataCompareAt === "number" &&
    typeof currentAmount === "number" &&
    metadataCompareAt > currentAmount
  ) {
    return {
      amount: metadataCompareAt,
      currency_code: calculated?.currency_code || "inr",
    };
  }

  return undefined;
};

// Whether `createdAt` falls within `windowDays` of `now` — a product created
// in the future (clock skew) or with no/unparsable `created_at` is never
// "new".
export const isRecentlyCreated = (
  createdAt: string | null | undefined,
  now: Date = new Date(),
  windowDays: number = NEW_BADGE_WINDOW_DAYS,
): boolean => {
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  const ageMs = now.getTime() - createdMs;
  return ageMs >= 0 && ageMs <= windowDays * 24 * 60 * 60 * 1000;
};

// Derives every card-facing badge for a product. `variant` is the one whose
// price the card actually displays — callers should pass
// `getDefaultVariant(product)` (the same "first in-stock, else first
// variant" rule the PDP uses) so the sale badge/compare price always
// matches the price shown next to it. `soldOut` still checks every variant,
// independent of which one is "representative".
export const getProductBadges = (
  product: Pick<Product, "variants" | "created_at">,
  variant: Variant | undefined | null,
  now: Date = new Date(),
): ProductBadges => {
  const comparePrice = compareAtPrice(variant);
  return {
    soldOut: !product.variants.some(
      (candidate) => getVariantAvailability(candidate).availableForSale,
    ),
    sale: Boolean(comparePrice),
    isNew: isRecentlyCreated(product.created_at, now),
    comparePrice,
  };
};

// Re-exported so callers that only have a product (no already-resolved
// variant) can get both in one import.
export { getDefaultVariant };
