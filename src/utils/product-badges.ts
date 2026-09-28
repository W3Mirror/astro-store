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

// A "Sale" badge/struck MRP is driven by exactly the comparison Medusa's own
// Store API supports for a promotional or price-list discount:
// `calculated_price.original_amount` (the undiscounted/list price) vs.
// `calculated_price.calculated_amount` (the final price after any active
// discount) — see `CalculatedPriceResult` in `schemas.ts`. This is the same
// field pair `ProductVariantPicker.svelte`'s own `comparePrice` already
// reads; there is no separate "compare_at_price" field on a Medusa variant,
// so this template never invents one.
export const compareAtPrice = (
  variant: Variant | undefined | null,
): ProductBadgeComparePrice | undefined => {
  const calculated = variant?.calculated_price;
  if (
    !calculated ||
    calculated.original_amount === null ||
    calculated.calculated_amount === null ||
    calculated.original_amount <= calculated.calculated_amount
  ) {
    return undefined;
  }
  return {
    amount: calculated.original_amount,
    currency_code: calculated.currency_code || "inr",
  };
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
