<script lang="ts">
  import { onMount } from "svelte";
  import { cart, clearCart } from "../../stores/cart";
  import {
    createPaymentCollection,
    createPaymentSession,
    completeCart,
  } from "../../utils/medusa";
  import type {
    Stripe,
    StripeElements,
    StripePaymentElement,
  } from "@stripe/stripe-js";

  interface Props {
    stripePublishableKey: string;
    onBack: () => void;
  }

  let { stripePublishableKey, onBack }: Props = $props();

  const providerId = stripePublishableKey
    ? "pp_stripe_stripe"
    : "pp_system_default";

  let initializing = $state(true);
  let placing = $state(false);
  let error = $state("");
  // Always present in the DOM (never behind an #if) so it's mounted before
  // the async Stripe setup in onMount tries to use it.
  let paymentElementEl: HTMLDivElement | undefined = $state();

  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let paymentElement: StripePaymentElement | null = null;

  onMount(async () => {
    const cartId = cart.get()?.id;

    if (!cartId) {
      error =
        "Your cart could not be found. Please go back to the shop and try again.";
      initializing = false;
      return;
    }

    try {
      const paymentCollection = await createPaymentCollection(cartId);
      if (!paymentCollection) {
        throw new Error("Couldn't start payment. Please try again.");
      }

      const updatedCollection = await createPaymentSession(
        paymentCollection.id,
        providerId
      );
      const session = updatedCollection?.payment_sessions?.find(
        (s) => s.provider_id === providerId
      );

      if (stripePublishableKey) {
        const clientSecret = session?.data?.client_secret;
        if (typeof clientSecret !== "string") {
          throw new Error(
            "Couldn't start the Stripe payment session. Please try again."
          );
        }

        // Only imported when Stripe is actually configured for this store.
        const { loadStripe } = await import("@stripe/stripe-js");
        stripe = await loadStripe(stripePublishableKey);

        if (!stripe) {
          throw new Error(
            "Couldn't load the payment form. Please refresh and try again."
          );
        }

        elements = stripe.elements({ clientSecret });
        paymentElement = elements.create("payment");
        if (paymentElementEl) {
          paymentElement.mount(paymentElementEl);
        }
      }
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Couldn't start payment. Please try again.";
    } finally {
      initializing = false;
    }
  });

  async function handlePlaceOrder(event: SubmitEvent) {
    event.preventDefault();

    const cartId = cart.get()?.id;
    if (!cartId) return;

    placing = true;
    error = "";

    try {
      if (stripe && elements) {
        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
        });

        if (confirmError) {
          error =
            confirmError.message ??
            "Your card was declined. Please try a different payment method.";
          placing = false;
          return;
        }
      }

      const result = await completeCart(cartId);

      if (result.type === "order" && result.order) {
        const orderId = (result.order as { id: string }).id;
        clearCart();
        window.location.href = `/order/${orderId}`;
        return;
      }

      error =
        result.error?.message ||
        "We couldn't complete your order. Please review your details and try again.";
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "We couldn't complete your order. Please try again.";
    } finally {
      placing = false;
    }
  }
</script>

<div class="space-y-6">
  <h2 class="text-lg font-semibold text-zinc-800">Payment</h2>

  <form onsubmit={handlePlaceOrder} class="space-y-6">
    {#if initializing}
      <p class="text-sm text-zinc-500">Preparing payment…</p>
    {/if}

    {#if stripePublishableKey}
      <div bind:this={paymentElementEl}></div>
    {:else if !initializing}
      <p
        class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-zinc-600"
      >
        This store doesn't take online payments yet — placing your order will
        mark it for manual payment collection.
      </p>
    {/if}

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
        disabled={placing}
      >
        &larr; Back
      </button>
      <button
        type="submit"
        class="button flex-1"
        disabled={initializing || placing}
      >
        {placing ? "Placing order..." : "Place order"}
      </button>
    </div>
  </form>
</div>
