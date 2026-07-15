<script lang="ts">
  import { onMount } from "svelte";
  import { getOrderTracking } from "../../utils/medusa";

  let { orderId }: { orderId: string } = $props();
  let tracking = $state<Awaited<ReturnType<typeof getOrderTracking>> | null>(null);

  onMount(async () => {
    const email = sessionStorage.getItem(
      `medusa_order_tracking_email:${orderId}`,
    );
    if (!email) return;

    try {
      tracking = await getOrderTracking(orderId, email);
    } catch {
      // A shipment may not exist immediately after checkout.
    }
  });

  function formatStatus(status: string) {
    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatDate(value?: string) {
    return value
      ? new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "";
  }
</script>

{#if tracking && tracking.shipments.length > 0}
  <section class="mt-10 overflow-hidden rounded-lg border border-gray-200 bg-white">
    <div class="border-b border-zinc-100 bg-emerald-950 px-6 py-5 text-white">
      <p class="text-xs font-semibold tracking-[0.18em] text-emerald-200 uppercase">
        Delivery progress
      </p>
      <h2 class="mt-1 text-xl font-semibold">Track your shipment</h2>
    </div>

    <div class="divide-y divide-zinc-100">
      {#each tracking.shipments as shipment}
        <article class="p-6 sm:p-8">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                {shipment.carrier}
              </p>
              <h3 class="mt-1 text-lg font-semibold text-zinc-900">
                {formatStatus(shipment.status)}
              </h3>
              {#if shipment.estimated_delivery && !shipment.terminal}
                <p class="mt-1 text-sm text-zinc-500">
                  Estimated delivery {formatDate(shipment.estimated_delivery)}
                </p>
              {/if}
            </div>
            <div class="text-right">
              <p class="font-mono text-sm text-zinc-600">
                {shipment.tracking_number}
              </p>
              {#if shipment.tracking_url}
                <a
                  href={shipment.tracking_url}
                  target="_blank"
                  rel="noreferrer"
                  class="mt-1 inline-block text-sm font-semibold text-emerald-800 hover:text-emerald-600"
                >
                  Carrier tracking <span aria-hidden="true">&nearr;</span>
                </a>
              {/if}
            </div>
          </div>

          {#if shipment.events.length > 0}
            <ol class="relative mt-8 space-y-6 border-l border-emerald-200 pl-6">
              {#each [...shipment.events].reverse() as event, index}
                <li class="relative">
                  <span
                    class={`absolute top-1 -left-[29px] h-3 w-3 rounded-full border-2 border-white ring-1 ${index === 0 ? "bg-emerald-700 ring-emerald-700" : "bg-zinc-300 ring-zinc-300"}`}
                  ></span>
                  <p class="text-sm font-semibold text-zinc-800">
                    {event.description}
                  </p>
                  <p class="mt-1 text-xs text-zinc-500">
                    {formatDate(event.occurred_at)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </li>
              {/each}
            </ol>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}
