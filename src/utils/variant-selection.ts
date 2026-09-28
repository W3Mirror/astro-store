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
  // The image of the variant this value would resolve to (holding the rest
  // of the current selection fixed) — see `getVariantImageUrl`. Undefined
  // when that variant doesn't exist or carries no image; a Colour-style
  // swatch falls back to a plain text chip in that case (rule 4d).
  imageUrl?: string;
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
        imageUrl: getVariantImageUrl(candidate),
      };
    }),
  }));

// A product only needs a picker when it has more than one purchasable
// variant — a single-variant product (including one with zero declared
// options) should show plain price/stock/add-to-cart with no controls.
export const needsVariantPicker = (
  product: Pick<Product, "options" | "variants">,
): boolean => product.variants.length > 1 && product.options.length > 0;

// Per-variant imagery isn't a first-class product relation in Medusa yet —
// see `VariantResult`'s doc comment in `schemas.ts`. Until it is, a
// merchant can set `metadata.image_url` on a variant and this picks it up;
// absent metadata (the common case today) returns `undefined` so callers
// fall back to today's behavior exactly (no image, plain text chip).
export const getVariantImageUrl = (
  variant: Variant | undefined | null,
): string | undefined => {
  const url = variant?.metadata?.image_url;
  return typeof url === "string" && url.trim().length > 0
    ? url
    : undefined;
};

// Generic (never store-specific) option-name matchers — used to decide
// which *kind* of control an option gets, never which store-specific
// values it has.
export const isColourOptionTitle = (title: string): boolean =>
  /^colou?r$/i.test(title.trim());

export const isSizeOptionTitle = (title: string): boolean =>
  title.trim().toLowerCase() === "size";

export interface ForcedOption {
  optionId: string;
  value: string;
}

// Rule 4a: "given the other current selections, if an option has exactly
// one valid value, auto-select it and hide its control" — e.g. Type
// [Unstitched, Stitched] x Size [Free Size, XS...3XL], where Unstitched
// pairs only with Free Size.
//
// This walks `product.options` in DECLARATION ORDER, treating it as
// "primary chooser first": each option's set of reachable values is
// computed by constraining only the options *before* it (to their current
// selection, once decided), never the options after it. That directional
// constraint is what keeps this asymmetric — without it, evaluating every
// option against every *other* option's current value (the symmetric
// definition `buildOptionGroups` uses for disabled-state rendering, which
// must stay exactly as-is) would also flag Type as "forced" whenever the
// shopper happens to be sitted on the one Type value paired with the
// currently-selected Size, which is not the intended rule.
export const computeForcedOptions = (
  product: Pick<Product, "options" | "variants">,
  selection: VariantSelection,
): ForcedOption[] => {
  const forced: ForcedOption[] = [];
  const priorSelection: VariantSelection = {};

  for (const option of product.options) {
    const reachableValues = new Set<string>();
    for (const variant of product.variants) {
      const variantSelection = selectionFromVariant(variant);
      const matchesPrior = Object.entries(priorSelection).every(
        ([optionId, value]) => variantSelection[optionId] === value,
      );
      if (!matchesPrior) continue;

      const value = variantSelection[option.id];
      if (value !== undefined) reachableValues.add(value);
    }

    if (reachableValues.size === 1) {
      const [onlyValue] = reachableValues;
      forced.push({ optionId: option.id, value: onlyValue });
      priorSelection[option.id] = onlyValue;
    } else if (selection[option.id] !== undefined) {
      // Not forced — carry the shopper's actual current pick forward so a
      // later option's reachable set reflects it.
      priorSelection[option.id] = selection[option.id];
    }
  }

  return forced;
};

// --- Pill/radiogroup picker rules -------------------------------------------
//
// Every option picker (Size, Fabric, Type, Colour, ...) renders as a row of
// pill buttons with `role="radiogroup"` semantics — a plain `<select>` is
// only a fallback for an unusually large value set. These are the pure,
// UI-framework-free rules the picker (`ProductVariantPicker.svelte`) is
// built from, kept here so they're testable without loading Svelte.

// A picker with more than this many *visible* values (see
// `visibleOptionValues`) falls back to a plain `<select>` — a wall of
// buttons stops being usable well before this, but a select stays fine.
export const OPTION_PICKER_SELECT_THRESHOLD = 12;

// Rule: given the shopper's other current picks, a value with NO existing
// variant is omitted from the picker entirely — never rendered, not even
// disabled (e.g. "Free Size" has no meaning once "Stitched" is picked, so it
// shouldn't appear under Stitched at all). A value that DOES exist but is
// out of stock stays visible, rendered disabled with "sold out" styling —
// see `isSelectableOptionValue`/the component's disabled state, matching the
// reference site's "sold-out sizes render disabled (not hidden)" rule.
export const visibleOptionValues = (
  values: OptionValueState[],
): OptionValueState[] => values.filter((value) => value.exists);

// Whether a picker with this many *visible* values should render as a plain
// `<select>` instead of a row of pill buttons.
export const usesSelectFallback = (
  visibleValues: OptionValueState[],
): boolean => visibleValues.length > OPTION_PICKER_SELECT_THRESHOLD;

// A value is reachable by click/keyboard as a live choice only once it
// exists AND is in stock — an existing-but-sold-out value is shown (per
// `visibleOptionValues`) but rendered `disabled`, exactly like a native
// radiogroup's disabled radio: visible, not interactive, skipped by arrow
// key navigation.
export const isSelectableOptionValue = (value: OptionValueState): boolean =>
  value.inStock;

// Roving-tabindex keyboard navigation for the pill radiogroup: given the
// values currently visible (`visibleOptionValues`) and the value the
// shopper is presently on, returns the value an ArrowLeft/Up (`direction:
// -1`) or ArrowRight/Down (`direction: 1`) press should move the selection
// (and focus) to. Only in-stock values are reachable this way — a disabled,
// sold-out pill is skipped, mirroring how a browser skips a disabled radio
// in a native radiogroup. Wraps at either end. `undefined` when nothing in
// the group is reachable at all (every visible value is sold out).
export const nextSelectableOptionValue = (
  values: OptionValueState[],
  currentValue: string | undefined,
  direction: 1 | -1,
): string | undefined => {
  const selectable = values.filter(isSelectableOptionValue);
  if (selectable.length === 0) return undefined;

  const currentIndex = selectable.findIndex(
    (value) => value.value === currentValue,
  );
  const nextIndex =
    currentIndex === -1
      ? direction > 0
        ? 0
        : selectable.length - 1
      : (currentIndex + direction + selectable.length) % selectable.length;

  return selectable[nextIndex].value;
};

// Which value should be the group's one roving tab stop (`tabindex="0"`,
// every other value `tabindex="-1"`) — the selected value when there is one
// within the visible set, otherwise the first visible value, exactly
// matching a native radiogroup's default tab stop.
export const isRovingTabStop = (
  value: OptionValueState,
  values: OptionValueState[],
): boolean => {
  if (value.selected) return true;
  if (values.some((candidate) => candidate.selected)) return false;
  return values[0]?.value === value.value;
};
