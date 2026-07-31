<script lang="ts">
  import { addCartItem, isCartUpdating } from "../stores/cart";

  let {
    variantId,
    promotionCode,
  }: { variantId: string; promotionCode?: string } = $props();
  let error = $state("");

  async function addRecommendation() {
    error = "";
    try {
      await addCartItem({
        id: variantId,
        quantity: 1,
        promotionCode,
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }
</script>

<button
  type="button"
  class="mt-4 w-full rounded-[var(--store-radius)] bg-[var(--store-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
  disabled={$isCartUpdating}
  onclick={addRecommendation}
>
  {$isCartUpdating ? "Adding…" : promotionCode ? `Add + apply ${promotionCode}` : "Add to bag"}
</button>
{#if error}
  <p class="mt-2 text-xs text-red-700" role="alert">{error}</p>
{/if}
