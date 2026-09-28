<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import {
    addCartItem,
    cart,
    cartError,
    isCartUpdating,
  } from "../stores/cart";

  interface Props {
    variantId: string;
    variantQuantityAvailable: number;
    variantAvailableForSale: boolean;
    // Preview links only — a draft product: the button is disabled and
    // says why (see `ProductVariantPicker.svelte`).
    purchaseBlocked?: boolean;
  }

  let {
    variantId,
    variantQuantityAvailable,
    variantAvailableForSale,
    purchaseBlocked = false,
  }: Props = $props();

  let selectedQuantity = $state(1);
  let quantityError = $state("");

  // Check if the variant is already in the cart and if there are any units left
  let variantInCart =
    $derived($cart &&
    $cart.items?.filter((item) => item.variant_id === variantId)[0]);
  let remainingQuantity = $derived(
    Number.isFinite(variantQuantityAvailable)
      ? Math.max(0, variantQuantityAvailable - (variantInCart?.quantity ?? 0))
      : Infinity,
  );
  let noQuantityLeft =
    $derived(Number.isFinite(remainingQuantity) && remainingQuantity < 1);

  function addToCart(e: Event) {
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const quantity = Number(formData.get("quantity"));
    const maxQuantity = Number.isFinite(remainingQuantity)
      ? remainingQuantity
      : Infinity;

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > maxQuantity
    ) {
      quantityError = Number.isFinite(maxQuantity)
        ? `Enter a whole number from 1 to ${maxQuantity}.`
        : "Enter a whole number of at least 1.";
      return;
    }

    if (purchaseBlocked) return;
    quantityError = "";
    void addCartItem({ id: variantId, quantity }).catch(() => {
      // The store exposes the readable error through cartError.
    });
  }
</script>

<form onsubmit={preventDefault((e) => addToCart(e))}>
  <label class="mt-8 block text-sm font-medium text-zinc-700" for="quantity">
    Quantity
  </label>
  <input
    id="quantity"
    name="quantity"
    type="number"
    min="1"
    step="1"
    max={Number.isFinite(remainingQuantity) ? remainingQuantity : undefined}
    bind:value={selectedQuantity}
    aria-describedby="quantity-help quantity-error"
    class="mt-2 w-24 rounded-md border border-zinc-300 px-3 py-2 text-zinc-900"
    disabled={purchaseBlocked || !variantAvailableForSale || noQuantityLeft || $isCartUpdating}
  />
  {#if Number.isFinite(remainingQuantity)}
    <p id="quantity-help" class="mt-1 text-sm text-zinc-500">
      {remainingQuantity} available
    </p>
  {:else}
    <p id="quantity-help" class="mt-1 text-sm text-zinc-500">
      Available while stock lasts
    </p>
  {/if}
  {#if quantityError || $cartError}
    <p
      id="quantity-error"
      class="mt-2 text-sm text-red-600"
      role="alert"
      aria-live="polite"
    >
      {quantityError || $cartError}
    </p>
  {/if}

  <button
    type="submit"
    class="button mt-10 w-full"
    disabled={purchaseBlocked || $isCartUpdating || noQuantityLeft || !variantAvailableForSale}
  >
    {#if $isCartUpdating}
      <svg
        class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    {/if}
    {#if purchaseBlocked}
      Not available in preview
    {:else if variantAvailableForSale}
      Add to bag
    {:else}
      Sold out
    {/if}
  </button>
  {#if purchaseBlocked}
    <p class="mt-2 text-center text-sm text-zinc-600" data-preview-purchase-note>
      This product is a draft. It can't be added to the bag until it's
      published.
    </p>
  {/if}
  {#if noQuantityLeft}
    <div class="text-center text-red-600">
      <small>All units left are in your cart</small>
    </div>
  {/if}
</form>
