import type { z } from "zod";
import type { ProductResult, VariantResult } from "./schemas";

type Product = NonNullable<z.infer<typeof ProductResult>>;
type Variant = z.infer<typeof VariantResult>;

// Maps an option id to the value selected for it (e.g. `{ opt_fabric:
// "Rayon", opt_type: "Unstitched" }`).
export type VariantSelection = Record<string, string>;

export interface VariantAvailability {
  // `Infinity` when inventory isn't tracked or backorders are allowed —
  // matches the convention already used on the product page.
  quantityAvailable: number;
  availableForSale: boolean;
}

export const getVariantAvailability = (
  variant: Variant | undefined | null,
): VariantAvailability => {
  if (!variant) return { quantityAvailable: 0, availableForSale: false };

  const quantityAvailable =
    variant.manage_inventory && !variant.allow_backorder
      ? (variant.inventory_quantity ?? 0)
      : Infinity;

  return {
    quantityAvailable,
    availableForSale: quantityAvailable > 0,
  };
};

// The selection a given variant represents, keyed by option id.
export const selectionFromVariant = (
  variant: Variant | undefined | null,
): VariantSelection => {
  const selection: VariantSelection = {};
  for (const option of variant?.options ?? []) {
    if (option.option_id) selection[option.option_id] = option.value;
  }
  return selection;
};

// Exact-match lookup: every one of the product's options must resolve to the
// same value on a candidate variant. A product with no options at all (a
// simple, single-variant product) always resolves to its one variant.
export const findVariantForSelection = (
  product: Pick<Product, "options" | "variants">,
  selection: VariantSelection,
): Variant | undefined => {
  const optionIds = product.options.map((option) => option.id);
  if (optionIds.length === 0) return product.variants[0];

  return product.variants.find((variant) => {
    const variantSelection = selectionFromVariant(variant);
    return optionIds.every(
      (optionId) => variantSelection[optionId] === selection[optionId],
    );
  });
};

// The sensible default: the first in-stock variant, or the first variant at
// all if none are in stock.
export const getDefaultVariant = (
  product: Pick<Product, "variants">,
): Variant | undefined => {
  const available = product.variants.find(
    (variant) => getVariantAvailability(variant).availableForSale,
  );
  return available ?? product.variants[0];
};

// Resolves the variant a page render should treat as selected. An explicit
// `?variant=<id>` wins when it names one of this product's own variants;
// otherwise falls back to the default. Used both for the SSR-selected
// variant and to seed the client picker's initial state.
export const resolveInitialVariant = (
  product: Pick<Product, "variants">,
  requestedVariantId: string | null | undefined,
): Variant | undefined => {
  if (requestedVariantId) {
    const requested = product.variants.find(
      (variant) => variant.id === requestedVariantId,
    );
    if (requested) return requested;
  }
  return getDefaultVariant(product);
};

export interface OptionValueState {
  value: string;
  // A real variant exists for this value combined with the rest of the
  // current selection (the other options held fixed).
  exists: boolean;
  // That variant (only meaningful when `exists`) currently has stock.
  inStock: boolean;
  selected: boolean;
}

export interface OptionGroupState {
  id: string;
  title: string;
  values: OptionValueState[];
}

// For every option and every one of its values, determines whether picking
// that value (holding the rest of the current selection fixed) resolves to
// a real variant, and whether that variant is in stock. Drives which values
// render as disabled (no such combination) vs. selectable-but-sold-out
// (combination exists, no stock) in the picker UI.
export const buildOptionGroups = (
  product: Pick<Product, "options" | "variants">,
  selection: VariantSelection,
): OptionGroupState[] =>
  product.options.map((option) => ({
    id: option.id,
    title: option.title,
    values: option.values.map((optionValue) => {
      const candidateSelection = {
        ...selection,
        [option.id]: optionValue.value,
      };
      const candidate = findVariantForSelection(product, candidateSelection);
      const availability = getVariantAvailability(candidate);

      return {
        value: optionValue.value,
        exists: Boolean(candidate),
        inStock: availability.availableForSale,
        selected: selection[option.id] === optionValue.value,
      };
    }),
  }));

// A product only needs a picker when it has more than one purchasable
// variant — a single-variant product (including one with zero declared
// options) should show plain price/stock/add-to-cart with no controls.
export const needsVariantPicker = (
  product: Pick<Product, "options" | "variants">,
): boolean => product.variants.length > 1 && product.options.length > 0;
