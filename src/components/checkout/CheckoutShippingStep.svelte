<script lang="ts">
  import { onMount } from "svelte";
  import { cart } from "../../stores/cart";
  import { getShippingOptions, addShippingMethod } from "../../utils/medusa";
  import Money from "../Money.svelte";

  interface Props {
    onBack: () => void;
    onNext: () => void;
  }

  let { onBack, onNext }: Props = $props();

  let options = $state<Awaited<ReturnType<typeof getShippingOptions>>>([]);
  let selectedOptionId = $state(
    cart.get()?.shipping_methods?.[0]?.shipping_option_id ?? ""
  );
  let loading = $state(true);
  let submitting = $state(false);
  let error = $state("");

  const currencyCode = cart.get()?.currency_code ?? "inr";

  onMount(async () => {
    const cartId = cart.get()?.id;

    if (!cartId) {
      error =
        "Your cart could not be found. Please go back to the shop and try again.";
      loading = false;
      return;
    }

    try {
      options = await getShippingOptions(cartId);

      if (
        !selectedOptionId ||
        !options.some((option) => option.id === selectedOptionId)
      ) {
        selectedOptionId = options.find((o) => !o.insufficient_inventory)?.id ?? "";
      }
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Couldn't load shipping options. Please try again.";
    } finally {
      loading = false;
    }
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const cartId = cart.get()?.id;
    if (!cartId || !selectedOptionId) return;

    submitting = true;
    error = "";

    try {
      const updated = await addShippingMethod(cartId, selectedOptionId);
      if (updated) {
        cart.set(updated);
      }
      onNext();
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Couldn't set the shipping method. Please try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="space-y-6">
  <h2 class="text-lg font-semibold text-zinc-800">Shipping method</h2>

  {#if loading}
    <p class="text-sm text-zinc-500">Loading shipping options…</p>
  {:else if options.length === 0}
    <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {error ||
        "No shipping options are available for this address. Go back and double-check it, or contact the store."}
    </p>
    <button
      type="button"
      class="text-sm font-semibold text-emerald-900 hover:text-emerald-700"
      onclick={onBack}
    >
      &larr; Back to address
    </button>
  {:else}
    <form onsubmit={handleSubmit} class="space-y-6">
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <ul role="list" class="space-y-3">
        {#each options as option (option.id)}
          <li>
            <label
              class="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-gray-300 p-4 text-sm has-[:checked]:border-emerald-800 has-[:checked]:ring-1 has-[:checked]:ring-emerald-800 {option.insufficient_inventory
                ? 'cursor-not-allowed opacity-50'
                : ''}"
            >
              <span class="flex items-center gap-3">
                <input
                  type="radio"
                  name="shipping-option"
                  value={option.id}
                  bind:group={selectedOptionId}
                  disabled={option.insufficient_inventory}
                  required
                />
                {option.name}
              </span>
              <span class="font-medium text-zinc-800">
                <Money
                  price={{
                    amount: option.amount ?? 0,
                    currency_code: currencyCode,
                  }}
                />
              </span>
            </label>
            {#if option.insufficient_inventory}
              <p class="mt-1 text-xs text-red-600">
                Some items in your cart aren't available for this shipping
                method.
              </p>
            {/if}
          </li>
        {/each}
      </ul>

      {#if error}
        <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      {/if}

      <div class="flex items-center gap-6">
        <button
          type="button"
          class="text-sm font-semibold text-emerald-900 hover:text-emerald-700"
          onclick={onBack}
          disabled={submitting}
        >
          &larr; Back
        </button>
        <button
          type="submit"
          class="button flex-1"
          disabled={submitting || !selectedOptionId}
        >
          {submitting ? "Saving..." : "Continue to payment"}
        </button>
      </div>
    </form>
  {/if}
</div>
