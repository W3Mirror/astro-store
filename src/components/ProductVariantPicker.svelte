<script lang="ts">
  import type { z } from "zod";
  import type { ProductResult } from "../utils/schemas";
  import {
    buildOptionGroups,
    findVariantForSelection,
    getVariantAvailability,
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
  }

  let { product, initialVariantId }: Props = $props();

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
    {#each optionGroups as group (group.id)}
      <fieldset>
        <legend class="text-sm font-medium text-zinc-700">
          {group.title}
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
              <button
                type="button"
                class={valueButtonClass(optionValue)}
                aria-pressed={optionValue.selected}
                disabled={!optionValue.exists}
                onclick={() => selectValue(group.id, optionValue.value)}
              >
                {optionValue.value}
              </button>
            {/each}
          </div>
        {/if}
      </fieldset>
    {/each}
  </div>
{/if}

<AddToCartForm
  variantId={selectedVariant?.id ?? ""}
  variantQuantityAvailable={availability.quantityAvailable}
  variantAvailableForSale={Boolean(selectedVariant) && availability.availableForSale}
/>
