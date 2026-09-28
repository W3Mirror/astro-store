<script lang="ts">
  import { tick } from "svelte";
  import type { z } from "zod";
  import type { ProductResult } from "../utils/schemas";
  import {
    buildOptionGroups,
    computeForcedOptions,
    findVariantForSelection,
    getVariantAvailability,
    getVariantImageUrl,
    isColourOptionTitle,
    isRovingTabStop,
    isSizeOptionTitle,
    nextSelectableOptionValue,
    resolveInitialVariant,
    selectionFromVariant,
    needsVariantPicker,
    usesSelectFallback,
    visibleOptionValues,
    type OptionValueState,
    type VariantSelection,
  } from "../utils/variant-selection";
  import { toMoney } from "../utils/medusa";
  import { compareAtPrice } from "../utils/product-badges";
  import { addCartItem, isCartUpdating } from "../stores/cart";
  import Money from "./Money.svelte";
  import AddToCartForm from "./AddToCartForm.svelte";

  type Product = NonNullable<z.infer<typeof ProductResult>>;

  interface Props {
    product: Product;
    initialVariantId?: string;
    // Store settings (`utils/site-config.ts`) — both optional, both no-ops
    // when unset: no "Size chart" link renders without an image url, and no
    // note renders under the pickers without one.
    sizeChartImageUrl?: string | null;
    customFitNote?: string | null;
    // Used only by the mobile sticky "Add to bag" bar (rule 8) — the same
    // thumbnail/title the rest of the page already shows.
    productImageUrl?: string | null;
    productTitle?: string;
  }

  let {
    product,
    initialVariantId,
    sizeChartImageUrl = null,
    customFitNote = null,
    productImageUrl = null,
    productTitle = "",
  }: Props = $props();

  const showPicker = needsVariantPicker(product);

  // Seeded once from the SSR-resolved variant so hydration matches the
  // server-rendered markup exactly.
  let selection = $state<VariantSelection>(
    selectionFromVariant(resolveInitialVariant(product, initialVariantId)),
  );

  let selectedVariant = $derived(
    findVariantForSelection(product, selection),
  );
  let optionGroups = $derived(buildOptionGroups(product, selection));
  // Rule 4a: an option with exactly one valid value (given the shopper's
  // other current picks) is auto-selected and its control hidden — see
  // `computeForcedOptions`'s doc comment for why this needs the product +
  // live selection, not just `optionGroups`.
  let forcedOptions = $derived(computeForcedOptions(product, selection));
  let hiddenOptionIds = $derived(
    new Set(forcedOptions.map((forced) => forced.optionId)),
  );
  let visibleOptionGroups = $derived(
    optionGroups.filter((group) => !hiddenOptionIds.has(group.id)),
  );
  let availability = $derived(getVariantAvailability(selectedVariant));
  let price = $derived(toMoney(selectedVariant?.calculated_price));
  // Shared with the product card's Sale badge (`product-badges.ts`'s
  // `compareAtPrice`) so the PDP and card never disagree on which source
  // (a real calculated-price discount, or a merchant-set
  // `metadata.compare_at_price`) is showing.
  let comparePrice = $derived(compareAtPrice(selectedVariant));

  function selectValue(optionId: string, value: string) {
    selection = { ...selection, [optionId]: value };
  }

  // Apply every forced auto-selection in one pass. Guarded so it's a no-op
  // (no state write, no extra render) once the selection already matches —
  // `buildOptionGroups`/`computeForcedOptions` re-derive from `selection`,
  // so writing here re-triggers them; without the guard this would loop.
  $effect(() => {
    if (forcedOptions.length === 0) return;
    const next = { ...selection };
    let changed = false;
    for (const forced of forcedOptions) {
      if (next[forced.optionId] !== forced.value) {
        next[forced.optionId] = forced.value;
        changed = true;
      }
    }
    if (changed) selection = next;
  });

  // Every value reaching these two functions has already passed through
  // `visibleOptionValues` (exists === true) — only in-stock/selected state
  // is left to render.
  function valueButtonClass(optionValue: { inStock: boolean; selected: boolean }) {
    const classes = [
      "rounded-md border px-4 py-2 text-sm font-medium transition",
    ];
    if (optionValue.selected) {
      classes.push("border-emerald-900 bg-emerald-900 text-white");
    } else {
      classes.push(
        "border-zinc-300 bg-white text-zinc-900 hover:border-emerald-900",
      );
    }
    if (!optionValue.inStock) {
      classes.push("cursor-not-allowed text-zinc-400 line-through opacity-60");
    }
    return classes.join(" ");
  }

  function swatchButtonClass(optionValue: { inStock: boolean; selected: boolean }) {
    const classes = [
      "relative h-10 w-10 overflow-hidden rounded-full border-2 bg-cover bg-center transition",
    ];
    classes.push(
      optionValue.selected ? "border-emerald-900" : "border-zinc-300",
    );
    if (!optionValue.inStock) {
      classes.push("cursor-not-allowed opacity-50");
    }
    return classes.join(" ");
  }

  // --- Radiogroup keyboard navigation (Rule 2: "keyboard arrows") ----------
  //
  // One ref per rendered pill, keyed by `${groupId}::${value}`, so an arrow
  // press can move DOM focus to the newly-selected pill after Svelte
  // re-renders (`tick()`), matching native radiogroup behaviour.
  let buttonRefs: Record<string, HTMLButtonElement> = {};
  const buttonRefKey = (groupId: string, value: string) => `${groupId}::${value}`;

  async function moveSelection(
    groupId: string,
    values: OptionValueState[],
    direction: 1 | -1,
  ) {
    const currentValue = selection[groupId];
    const next = nextSelectableOptionValue(values, currentValue, direction);
    if (!next) return;
    selectValue(groupId, next);
    await tick();
    buttonRefs[buttonRefKey(groupId, next)]?.focus();
  }

  function handlePickerKeydown(
    event: KeyboardEvent,
    groupId: string,
    values: OptionValueState[],
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        void moveSelection(groupId, values, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        void moveSelection(groupId, values, -1);
        break;
      default:
        break;
    }
  }

  // --- Sticky mobile "Add to bag" bar (Rule 4) ------------------------------
  //
  // Appears once the primary add-to-cart button scrolls out of view.
  // `atcAnchorEl` wraps that button; an IntersectionObserver on it is the
  // simplest scroll-position signal with no scroll-event listener needed.
  let atcAnchorEl: HTMLDivElement | undefined = $state();
  let stickyAtcVisible = $state(false);
  let stickyAddError = $state("");

  $effect(() => {
    if (typeof window === "undefined" || !atcAnchorEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        stickyAtcVisible = !entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(atcAnchorEl);
    return () => observer.disconnect();
  });

  // Lets the sitewide floating WhatsApp button (a separate Astro island — no
  // shared store) shift itself above this bar on mobile instead of being
  // covered by it, the same cross-island bridge `pdp:variant-image` uses.
  $effect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("pdp:sticky-atc", { detail: { visible: stickyAtcVisible } }),
    );
  });

  async function addSelectedVariantToCart() {
    if (!selectedVariant || !availability.availableForSale) return;
    stickyAddError = "";
    try {
      await addCartItem({ id: selectedVariant.id, quantity: 1 });
    } catch (caught) {
      stickyAddError = caught instanceof Error ? caught.message : String(caught);
    }
  }

  // Keep `?variant=<id>` in sync with the current selection so the page can
  // be shared/reloaded with the same variant preselected. Runs on mount too
  // (writing the resolved default), and again whenever the selection
  // changes client-side. `replaceState` avoids polluting browser history
  // with one entry per option click.
  $effect(() => {
    if (typeof window === "undefined") return;
    const id = selectedVariant?.id;
    if (!id) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("variant") === id) return;
    url.searchParams.set("variant", id);
    window.history.replaceState(window.history.state, "", url);
  });

  // Rule 4d (part 2): a variant with its own image (native `thumbnail`/
  // `images`, or `metadata.image_url` — see `getVariantImageUrl`) drives
  // the PDP gallery's main image too, not
  // just its own swatch. The gallery is a separate Astro/vanilla-JS island
  // with no shared store, so a plain window CustomEvent is the simplest
  // cross-island bridge; it fires with `url: null` to tell the gallery to
  // fall back to its own default image whenever the selected variant has
  // none.
  $effect(() => {
    if (typeof window === "undefined") return;
    const url = getVariantImageUrl(selectedVariant) ?? null;
    window.dispatchEvent(
      new CustomEvent("pdp:variant-image", { detail: { url } }),
    );
  });
</script>

<div class="mt-4 text-3xl font-bold text-emerald-900">
  <Money price={price} />
  {#if comparePrice}
    <span class="ml-2 text-lg font-medium text-zinc-400 line-through">
      <Money price={comparePrice} />
    </span>
  {/if}
</div>

{#if selectedVariant?.sku}
  <p class="mt-1 text-sm text-zinc-500">SKU: {selectedVariant.sku}</p>
{/if}

{#if !selectedVariant}
  <p class="mt-2 text-sm text-red-600" role="alert">
    This combination is not available.
  </p>
{:else if !availability.availableForSale}
  <p class="mt-2 text-sm text-zinc-600">Sold out</p>
{:else if Number.isFinite(availability.quantityAvailable) && availability.quantityAvailable <= 5}
  <p class="mt-2 text-sm text-zinc-600">
    Only {availability.quantityAvailable} left
  </p>
{/if}

{#if showPicker}
  <div class="mt-6 space-y-6">
    {#each visibleOptionGroups as group (group.id)}
      {@const colourAxis = isColourOptionTitle(group.title)}
      {@const sizeAxis = isSizeOptionTitle(group.title)}
      {@const visible = visibleOptionValues(group.values)}
      <fieldset>
        <legend class="flex items-center gap-3 text-sm font-medium text-zinc-700">
          {group.title}
          {#if sizeAxis && sizeChartImageUrl}
            <button
              type="button"
              class="text-xs font-semibold text-emerald-900 underline underline-offset-2"
              data-open-dialog="size-chart-modal"
            >
              Size chart
            </button>
          {/if}
        </legend>
        {#if usesSelectFallback(visible)}
          <select
            class="account-input"
            aria-label={group.title}
            value={selection[group.id] ?? ""}
            onchange={(event) =>
              selectValue(group.id, (event.currentTarget as HTMLSelectElement).value)}
          >
            {#each visible as optionValue (optionValue.value)}
              <option value={optionValue.value} disabled={!optionValue.inStock}>
                {optionValue.value}{!optionValue.inStock ? " (sold out)" : ""}
              </option>
            {/each}
          </select>
        {:else}
          <!-- Rule 2: pill buttons with radiogroup semantics — role/
               aria-checked/roving tabindex plus Left/Right/Up/Down arrow-key
               navigation (see `handlePickerKeydown`), for every option, not
               just Size. A value with no existing variant for the rest of
               the current selection is never rendered here at all (see
               `visibleOptionValues`); an existing-but-sold-out value stays
               visible, disabled, labelled "(sold out)". -->
          <div
            class="mt-2 flex flex-wrap gap-2"
            role="radiogroup"
            tabindex="-1"
            aria-label={group.title}
            onkeydown={(event) => handlePickerKeydown(event, group.id, visible)}
          >
            {#each visible as optionValue (optionValue.value)}
              {#if colourAxis && optionValue.imageUrl}
                <button
                  type="button"
                  role="radio"
                  class={swatchButtonClass(optionValue)}
                  style={`background-image: url('${optionValue.imageUrl}')`}
                  aria-checked={optionValue.selected}
                  aria-label={`${optionValue.value}${!optionValue.inStock ? " (sold out)" : ""}`}
                  tabindex={isRovingTabStop(optionValue, visible) ? 0 : -1}
                  disabled={!optionValue.inStock}
                  bind:this={buttonRefs[buttonRefKey(group.id, optionValue.value)]}
                  onclick={() => selectValue(group.id, optionValue.value)}
                ></button>
              {:else}
                <button
                  type="button"
                  role="radio"
                  class={valueButtonClass(optionValue)}
                  aria-checked={optionValue.selected}
                  aria-label={`${optionValue.value}${!optionValue.inStock ? " (sold out)" : ""}`}
                  tabindex={isRovingTabStop(optionValue, visible) ? 0 : -1}
                  disabled={!optionValue.inStock}
                  bind:this={buttonRefs[buttonRefKey(group.id, optionValue.value)]}
                  onclick={() => selectValue(group.id, optionValue.value)}
                >
                  {optionValue.value}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </fieldset>
    {/each}
  </div>
{/if}

{#if hiddenOptionIds.size > 0 && customFitNote}
  <p class="mt-4 text-sm text-zinc-600">{customFitNote}</p>
{/if}

{#if sizeChartImageUrl}
  <dialog
    id="size-chart-modal"
    aria-label="Size chart"
    class="fixed m-auto max-h-[90vh] w-[92vw] max-w-xl rounded-[var(--store-radius)] border-0 p-6 [&::backdrop]:bg-black/60"
  >
    <button
      type="button"
      class="absolute top-3 right-3 rounded-full bg-white/80 p-1.5"
      data-close-dialog
    >
      <span class="sr-only">Close size chart</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="h-6 w-6"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    <img src={sizeChartImageUrl} alt="Size chart" class="h-auto w-full" />
  </dialog>
{/if}

<div bind:this={atcAnchorEl}>
  <AddToCartForm
    variantId={selectedVariant?.id ?? ""}
    variantQuantityAvailable={availability.quantityAvailable}
    variantAvailableForSale={Boolean(selectedVariant) && availability.availableForSale}
  />
</div>

<!-- Rule 4: sticky mobile "Add to bag" bar — appears once the button above
     scrolls out of view (see the IntersectionObserver effect), mirrors the
     selected variant's price, and is disabled/labelled per its
     sold-out/no-selection state. `inert` while hidden keeps it out of the
     tab order and off-screen for reduced-motion/no-JS the same way. -->
<div
  class="pdp-sticky-atc md:hidden"
  class:pdp-sticky-atc--visible={stickyAtcVisible}
  inert={!stickyAtcVisible}
  aria-hidden={!stickyAtcVisible}
>
  <div class="pdp-sticky-atc__info">
    {#if productImageUrl}
      <img src={productImageUrl} alt="" class="pdp-sticky-atc__thumb" />
    {/if}
    <div class="pdp-sticky-atc__text">
      {#if productTitle}
        <p class="pdp-sticky-atc__title">{productTitle}</p>
      {/if}
      <p class="pdp-sticky-atc__price">
        <Money price={price} />
        {#if comparePrice}
          <span class="pdp-sticky-atc__compare"><Money price={comparePrice} /></span>
        {/if}
      </p>
    </div>
  </div>
  <button
    type="button"
    class="button pdp-sticky-atc__button"
    disabled={$isCartUpdating || !selectedVariant || !availability.availableForSale}
    onclick={addSelectedVariantToCart}
  >
    {#if !selectedVariant}
      Select options
    {:else if !availability.availableForSale}
      Sold out
    {:else if $isCartUpdating}
      Adding…
    {:else}
      Add to bag
    {/if}
  </button>
</div>
{#if stickyAddError}
  <p class="pdp-sticky-atc__error" role="alert">{stickyAddError}</p>
{/if}
