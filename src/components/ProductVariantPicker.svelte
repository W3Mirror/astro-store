<script lang="ts">
  import type { z } from "zod";
  import type { ProductResult } from "../utils/schemas";
  import {
    buildOptionGroups,
    computeForcedOptions,
    findVariantForSelection,
    getVariantAvailability,
    getVariantImageUrl,
    isColourOptionTitle,
    isSizeOptionTitle,
    resolveInitialVariant,
    selectionFromVariant,
    needsVariantPicker,
    type VariantSelection,
  } from "../utils/variant-selection";
  import { toMoney } from "../utils/medusa";
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
  }

  let {
    product,
    initialVariantId,
    sizeChartImageUrl = null,
    customFitNote = null,
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
  let comparePrice = $derived.by(() => {
    const calculated = selectedVariant?.calculated_price;
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
  });

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

  function valueButtonClass(optionValue: {
    exists: boolean;
    inStock: boolean;
    selected: boolean;
  }) {
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
    if (!optionValue.exists) {
      classes.push("cursor-not-allowed opacity-40");
    } else if (!optionValue.inStock && !optionValue.selected) {
      classes.push("text-zinc-400 line-through");
    }
    return classes.join(" ");
  }

  function swatchButtonClass(optionValue: {
    exists: boolean;
    inStock: boolean;
    selected: boolean;
  }) {
    const classes = [
      "relative h-10 w-10 overflow-hidden rounded-full border-2 bg-cover bg-center transition",
    ];
    classes.push(
      optionValue.selected ? "border-emerald-900" : "border-zinc-300",
    );
    if (!optionValue.exists) {
      classes.push("cursor-not-allowed opacity-40");
    } else if (!optionValue.inStock && !optionValue.selected) {
      classes.push("opacity-50");
    }
    return classes.join(" ");
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

  // Rule 4d (part 2): a variant with its own image (`metadata.image_url` —
  // see `getVariantImageUrl`) drives the PDP gallery's main image too, not
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
        {#if group.values.length > 6}
          <select
            class="account-input"
            aria-label={group.title}
            value={selection[group.id] ?? ""}
            onchange={(event) =>
              selectValue(group.id, (event.currentTarget as HTMLSelectElement).value)}
          >
            {#each group.values as optionValue (optionValue.value)}
              <option value={optionValue.value} disabled={!optionValue.exists}>
                {optionValue.value}{optionValue.exists && !optionValue.inStock
                  ? " (sold out)"
                  : ""}
              </option>
            {/each}
          </select>
        {:else}
          <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label={group.title}>
            {#each group.values as optionValue (optionValue.value)}
              {#if colourAxis && optionValue.imageUrl}
                <button
                  type="button"
                  class={swatchButtonClass(optionValue)}
                  style={`background-image: url('${optionValue.imageUrl}')`}
                  aria-pressed={optionValue.selected}
                  aria-label={`${optionValue.value}${optionValue.exists && !optionValue.inStock ? " (sold out)" : ""}`}
                  disabled={!optionValue.exists}
                  onclick={() => selectValue(group.id, optionValue.value)}
                ></button>
              {:else}
                <button
                  type="button"
                  class={valueButtonClass(optionValue)}
                  aria-pressed={optionValue.selected}
                  disabled={!optionValue.exists}
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

<AddToCartForm
  variantId={selectedVariant?.id ?? ""}
  variantQuantityAvailable={availability.quantityAvailable}
  variantAvailableForSale={Boolean(selectedVariant) && availability.availableForSale}
/>
