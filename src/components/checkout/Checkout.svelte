<script lang="ts">
  import { onMount } from "svelte";
  import { cart, initCart } from "../../stores/cart";
  import CheckoutContactStep from "./CheckoutContactStep.svelte";
  import CheckoutShippingStep from "./CheckoutShippingStep.svelte";
  import CheckoutPaymentStep from "./CheckoutPaymentStep.svelte";
  import CheckoutSummary from "./CheckoutSummary.svelte";

  interface Country {
    iso_2: string;
    display_name: string;
  }

  interface Props {
    countries: Country[];
    stripePublishableKey: string;
  }

  let { countries, stripePublishableKey }: Props = $props();

  type Step = "contact" | "shipping" | "payment";

  const steps: { id: Step; label: string }[] = [
    { id: "contact", label: "Contact & address" },
    { id: "shipping", label: "Shipping" },
    { id: "payment", label: "Payment" },
  ];

  // The cart is only known client-side (its ID lives in local storage), so
  // the checkout content stays hidden until it's been resolved — this keeps
  // the SSR-rendered page from flashing an incorrect "your cart is empty"
  // state before hydration catches up.
  let ready = $state(false);
  let step = $state<Step>("contact");

  onMount(async () => {
    await initCart();
    ready = true;
  });

  const hasItems = $derived(($cart?.items?.length ?? 0) > 0);
  const stepIndex = $derived(steps.findIndex((s) => s.id === step));

  function goToStep(next: Step) {
    step = next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
</script>

{#if !ready}
  <div class="flex justify-center py-24">
    <svg
      class="h-8 w-8 animate-spin text-emerald-900"
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
  </div>
{:else if !hasItems}
  <div class="py-24 text-center">
    <p class="text-gray-500">Your cart is empty.</p>
    <a
      href="/"
      class="mt-2 inline-block font-semibold text-emerald-900 hover:text-emerald-700"
    >
      Continue shopping
      <span aria-hidden="true"> &rarr;</span>
    </a>
  </div>
{:else}
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <ol role="list" class="mb-10 flex flex-wrap items-center gap-x-3 gap-y-2">
    {#each steps as s, index (s.id)}
      <li class="flex items-center gap-2">
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold {index <=
          stepIndex
            ? 'bg-emerald-900 text-white'
            : 'bg-gray-100 text-gray-400'}"
        >
          {index + 1}
        </span>
        <span
          class="text-sm {index === stepIndex
            ? 'font-semibold text-zinc-900'
            : 'text-zinc-500'}"
        >
          {s.label}
        </span>
        {#if index < steps.length - 1}
          <span class="ml-1 text-gray-300" aria-hidden="true">/</span>
        {/if}
      </li>
    {/each}
  </ol>

  <div class="grid gap-10 lg:grid-cols-12 lg:gap-16">
    <div class="lg:col-span-7">
      {#if step === "contact"}
        <CheckoutContactStep {countries} onNext={() => goToStep("shipping")} />
      {:else if step === "shipping"}
        <CheckoutShippingStep
          onBack={() => goToStep("contact")}
          onNext={() => goToStep("payment")}
        />
      {:else if step === "payment"}
        <CheckoutPaymentStep
          {stripePublishableKey}
          onBack={() => goToStep("shipping")}
        />
      {/if}
    </div>

    <div class="lg:col-span-5">
      <CheckoutSummary />
    </div>
  </div>
{/if}
