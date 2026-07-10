<script lang="ts">
  import { cart } from "../../stores/cart";
  import ResponsiveImage from "../ResponsiveImage.svelte";
  import Money from "../Money.svelte";

  const currencyCode = $derived($cart?.currency_code ?? "inr");
  const shippingSelected = $derived(($cart?.shipping_methods?.length ?? 0) > 0);
</script>

<div class="rounded-lg border border-gray-200 p-6">
  <h2 class="text-lg font-semibold text-zinc-800">Order summary</h2>

  <!-- svelte-ignore a11y_no_redundant_roles -->
  <ul role="list" class="mt-6 divide-y divide-zinc-100">
    {#each $cart?.items ?? [] as item (item.id)}
      <li class="flex gap-4 py-4">
        <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
          <ResponsiveImage
            image={item.thumbnail ? { url: item.thumbnail } : null}
            alt={item.product_title || item.title}
            classList="h-full w-full object-cover object-center"
            sizes="64px"
            loading="lazy"
          />
        </div>
        <div class="flex flex-1 flex-col gap-1">
          <p class="text-sm font-medium text-zinc-800">
            {item.product_title || item.title}
          </p>
          {#if item.variant_title}
            <p class="text-xs text-zinc-500">{item.variant_title}</p>
          {/if}
          <p class="text-xs text-zinc-500">Qty {item.quantity}</p>
        </div>
        <p class="text-sm font-medium text-zinc-800">
          <Money
            price={{
              amount: item.total ?? item.unit_price * item.quantity,
              currency_code: currencyCode,
            }}
          />
        </p>
      </li>
    {:else}
      <li class="py-4 text-sm text-zinc-500">Your cart is empty.</li>
    {/each}
  </ul>

  <dl class="mt-6 space-y-2 border-t border-zinc-100 pt-6 text-sm">
    <div class="flex justify-between">
      <dt class="text-zinc-600">Subtotal</dt>
      <dd class="font-medium text-zinc-800">
        <Money
          price={{ amount: $cart?.item_total ?? 0, currency_code: currencyCode }}
        />
      </dd>
    </div>
    <div class="flex justify-between">
      <dt class="text-zinc-600">Shipping</dt>
      <dd class="font-medium text-zinc-800">
        {#if shippingSelected}
          <Money
            price={{
              amount: $cart?.shipping_total ?? 0,
              currency_code: currencyCode,
            }}
          />
        {:else}
          <span class="text-zinc-400">Calculated at next step</span>
        {/if}
      </dd>
    </div>
    <div class="flex justify-between">
      <dt class="text-zinc-600">Tax</dt>
      <dd class="font-medium text-zinc-800">
        <Money
          price={{ amount: $cart?.tax_total ?? 0, currency_code: currencyCode }}
        />
      </dd>
    </div>
    <div
      class="flex justify-between border-t border-zinc-100 pt-3 text-base font-semibold text-zinc-900"
    >
      <dt>Total</dt>
      <dd>
        <Money
          price={{ amount: $cart?.total ?? 0, currency_code: currencyCode }}
          showCurrency={true}
        />
      </dd>
    </div>
  </dl>
</div>
