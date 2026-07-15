<script lang="ts">
  import { onMount } from "svelte";
  import { cart, clearCart } from "../../stores/cart";
  import {
    completeCart,
    confirmPaymentSession,
    createPaymentCollection,
    createPaymentSession,
    getPaymentOptions,
  } from "../../utils/medusa";
  import type {
    Stripe,
    StripeElements,
    StripePaymentElement,
  } from "@stripe/stripe-js";

  interface Props {
    onBack: () => void;
  }

  type PaymentOption = Awaited<
    ReturnType<typeof getPaymentOptions>
  >["payment_options"][number];

  type PaymentSession = {
    id: string;
    provider_id: string;
    data: Record<string, unknown>;
  };

  type RazorpayResult = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };

  type RazorpayInstance = {
    open: () => void;
  };

  const CASHFREE_PENDING_KEY = "medusa_cashfree_payment";

  let { onBack }: Props = $props();

  let options = $state<PaymentOption[]>([]);
  let selectedProviderId = $state("");
  let session = $state<PaymentSession | null>(null);
  let initializing = $state(true);
  let placing = $state(false);
  let error = $state("");
  let paymentElementEl: HTMLDivElement | undefined = $state();

  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let paymentElement: StripePaymentElement | null = null;
  let preparationId = 0;

  const selectedOption = $derived(
    options.find((option) => option.provider_id === selectedProviderId),
  );

  onMount(async () => {
    const cartId = cart.get()?.id;
    if (!cartId) {
      error =
        "Your cart could not be found. Please go back to the shop and try again.";
      initializing = false;
      return;
    }

    if (new URLSearchParams(window.location.search).get("cashfree") === "true") {
      try {
        placing = true;
        await resumeCashfreePayment(cartId);
        return;
      } catch (err) {
        error = messageFromError(err, "Couldn't verify the Cashfree payment.");
        placing = false;
        clearPaymentReturnParams();
      }
    }

    try {
      const result = await getPaymentOptions(cartId);
      options = result.payment_options;
      if (!options.length) {
        throw new Error(
          "No payment methods are available for this order. Please contact the store.",
        );
      }

      selectedProviderId = options[0].provider_id;
      await preparePayment(options[0], result.store_id);
    } catch (err) {
      error = messageFromError(err, "Couldn't start payment. Please try again.");
      initializing = false;
    }
  });

  async function selectProvider(option: PaymentOption) {
    if (option.provider_id === selectedProviderId && session) return;

    selectedProviderId = option.provider_id;
    const cartId = cart.get()?.id;
    if (!cartId) return;

    error = "";
    initializing = true;
    try {
      const result = await getPaymentOptions(cartId);
      const current = result.payment_options.find(
        (candidate) => candidate.provider_id === option.provider_id,
      );
      if (!current) {
        throw new Error("That payment method is no longer available.");
      }
      options = result.payment_options;
      await preparePayment(current, result.store_id);
    } catch (err) {
      error = messageFromError(err, "Couldn't start that payment method.");
      initializing = false;
    }
  }

  async function preparePayment(option: PaymentOption, storeId: string) {
    const cartId = cart.get()?.id;
    if (!cartId) return;

    const currentPreparation = ++preparationId;
    paymentElement?.destroy();
    paymentElement = null;
    elements = null;
    stripe = null;
    session = null;

    const paymentCollection = await createPaymentCollection(cartId);
    if (!paymentCollection) {
      throw new Error("Couldn't start payment. Please try again.");
    }

    const updatedCollection = await createPaymentSession(
      paymentCollection.id,
      option.provider_id,
      storeId,
    );
    const nextSession = updatedCollection?.payment_sessions?.find(
      (candidate) => candidate.provider_id === option.provider_id,
    );
    if (!nextSession) {
      throw new Error(`Couldn't start ${option.name}. Please try again.`);
    }
    if (currentPreparation !== preparationId) return;

    session = nextSession;
    if (option.provider === "stripe") {
      await prepareStripe(option, nextSession);
    }

    if (currentPreparation === preparationId) {
      initializing = false;
    }
  }

  async function prepareStripe(
    option: PaymentOption,
    paymentSession: PaymentSession,
  ) {
    const publishableKey = option.public_config.publishable_key;
    const clientSecret = paymentSession.data.client_secret;
    if (typeof publishableKey !== "string" || !publishableKey) {
      throw new Error("Stripe's publishable key is not configured.");
    }
    if (typeof clientSecret !== "string" || !clientSecret) {
      throw new Error("Stripe did not return a payment session.");
    }

    const { loadStripe } = await import("@stripe/stripe-js");
    stripe = await loadStripe(publishableKey);
    if (!stripe) {
      throw new Error("Couldn't load the Stripe payment form.");
    }

    elements = stripe.elements({ clientSecret });
    paymentElement = elements.create("payment");
    if (paymentElementEl) {
      paymentElement.mount(paymentElementEl);
    }
  }

  async function handlePlaceOrder(event: SubmitEvent) {
    event.preventDefault();

    const cartId = cart.get()?.id;
    if (!cartId || !session || !selectedOption) return;

    placing = true;
    error = "";

    try {
      if (selectedOption.provider === "stripe") {
        if (!stripe || !elements) {
          throw new Error("The Stripe payment form is not ready.");
        }
        const { error: stripeError } = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
        });
        if (stripeError) {
          throw new Error(
            stripeError.message ?? "Your card payment could not be confirmed.",
          );
        }
        await confirmPaymentSession(session.id);
        await finishOrder(cartId);
        return;
      }

      if (selectedOption.provider === "cashfree") {
        await openCashfreeCheckout(cartId, selectedOption, session);
        placing = false;
        return;
      }

      if (selectedOption.provider === "razorpay") {
        const result = await openRazorpayCheckout(selectedOption, session);
        await confirmPaymentSession(session.id, result);
        await finishOrder(cartId);
        return;
      }

      await finishOrder(cartId);
    } catch (err) {
      error = messageFromError(
        err,
        "We couldn't complete your order. Please try again.",
      );
      placing = false;
    }
  }

  async function finishOrder(cartId: string) {
    const result = await completeCart(cartId);
    if (result.type === "order" && result.order) {
      const orderId = (result.order as { id: string }).id;
      sessionStorage.removeItem(CASHFREE_PENDING_KEY);
      clearCart();
      window.location.href = `/order/${orderId}`;
      return;
    }

    throw new Error(
      result.error?.message ||
        "We couldn't complete your order. Please review your details and try again.",
    );
  }

  async function openCashfreeCheckout(
    cartId: string,
    option: PaymentOption,
    paymentSession: PaymentSession,
  ) {
    const cashfreeSessionId = paymentSession.data.payment_session_id;
    if (typeof cashfreeSessionId !== "string" || !cashfreeSessionId) {
      throw new Error("Cashfree did not return a checkout session.");
    }

    await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js");
    const cashfreeFactory = (
      window as typeof window & {
        Cashfree?: (options: { mode: "sandbox" | "production" }) => {
          checkout: (options: {
            paymentSessionId: string;
            redirectTarget: "_self";
          }) => Promise<unknown>;
        };
      }
    ).Cashfree;
    if (!cashfreeFactory) {
      throw new Error("Couldn't load Cashfree checkout.");
    }

    sessionStorage.setItem(
      CASHFREE_PENDING_KEY,
      JSON.stringify({ cart_id: cartId, session_id: paymentSession.id }),
    );
    const mode =
      option.public_config.environment === "production"
        ? "production"
        : "sandbox";
    await cashfreeFactory({ mode }).checkout({
      paymentSessionId: cashfreeSessionId,
      redirectTarget: "_self",
    });
  }

  async function resumeCashfreePayment(cartId: string) {
    const raw = sessionStorage.getItem(CASHFREE_PENDING_KEY);
    if (!raw) {
      throw new Error("The Cashfree payment session has expired.");
    }
    const pending = JSON.parse(raw) as {
      cart_id?: string;
      session_id?: string;
    };
    if (pending.cart_id !== cartId || !pending.session_id) {
      throw new Error("The Cashfree payment does not match this cart.");
    }

    await confirmPaymentSession(pending.session_id);
    await finishOrder(cartId);
  }

  async function openRazorpayCheckout(
    option: PaymentOption,
    paymentSession: PaymentSession,
  ): Promise<RazorpayResult> {
    await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    const Razorpay = (
      window as typeof window & {
        Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
      }
    ).Razorpay;
    if (!Razorpay) {
      throw new Error("Couldn't load Razorpay checkout.");
    }

    const key = paymentSession.data.key_id ?? option.public_config.key_id;
    const orderId = paymentSession.data.order_id;
    if (typeof key !== "string" || typeof orderId !== "string") {
      throw new Error("Razorpay did not return a valid checkout session.");
    }

    const currentCart = cart.get();
    return new Promise<RazorpayResult>((resolve, reject) => {
      const checkout = new Razorpay({
        key,
        order_id: orderId,
        amount: paymentSession.data.amount,
        currency: paymentSession.data.currency,
        name: option.name,
        prefill: {
          name: [
            currentCart?.shipping_address?.first_name,
            currentCart?.shipping_address?.last_name,
          ]
            .filter(Boolean)
            .join(" "),
          email: currentCart?.email,
          contact: currentCart?.shipping_address?.phone,
        },
        handler: (result: RazorpayResult) => resolve(result),
        modal: {
          ondismiss: () => reject(new Error("Razorpay checkout was closed.")),
        },
      });
      checkout.open();
    });
  }

  function loadScript(src: string): Promise<void> {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing?.dataset.loaded === "true") return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = existing ?? document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error("Couldn't load payment checkout."));
      if (!existing) document.head.appendChild(script);
    });
  }

  function clearPaymentReturnParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("cashfree");
    url.searchParams.delete("order_id");
    url.searchParams.delete("step");
    window.history.replaceState({}, "", url);
  }

  function messageFromError(err: unknown, fallback: string) {
    return err instanceof Error ? err.message : fallback;
  }
</script>

<div class="space-y-6">
  <div>
    <h2 class="text-lg font-semibold text-zinc-800">Payment</h2>
    <p class="mt-1 text-sm text-zinc-500">
      Choose one of the secure payment methods configured for this store.
    </p>
  </div>

  {#if options.length > 0}
    <fieldset disabled={placing}>
      <legend class="sr-only">Payment method</legend>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each options as option (option.provider_id)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 p-4 text-sm transition-colors has-[:checked]:border-emerald-800 has-[:checked]:bg-emerald-50/60 has-[:checked]:ring-1 has-[:checked]:ring-emerald-800"
          >
            <input
              type="radio"
              name="payment-provider"
              value={option.provider_id}
              checked={selectedProviderId === option.provider_id}
              onchange={() => selectProvider(option)}
            />
            <span>
              <span class="block font-semibold text-zinc-800">{option.name}</span>
              <span class="mt-0.5 block text-xs capitalize text-zinc-500">
                {option.provider === "manual"
                  ? "Pay as arranged with the store"
                  : `Secure ${option.provider} checkout`}
              </span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <form onsubmit={handlePlaceOrder} class="space-y-6">
    {#if initializing}
      <p class="text-sm text-zinc-500">Preparing secure payment...</p>
    {/if}

    <div
      bind:this={paymentElementEl}
      class:hidden={selectedOption?.provider !== "stripe"}
    ></div>

    {#if selectedOption?.provider === "cashfree" && !initializing}
      <p class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-zinc-600">
        You will continue to Cashfree to authorize this payment, then return
        here automatically.
      </p>
    {:else if selectedOption?.provider === "razorpay" && !initializing}
      <p class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-zinc-600">
        Razorpay will open a secure checkout window to complete your payment.
      </p>
    {:else if selectedOption?.provider === "manual" && !initializing}
      <p class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-zinc-600">
        Place the order now and the store will collect payment separately.
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
        disabled={initializing || placing || !session}
      >
        {placing ? "Processing..." : "Place order"}
      </button>
    </div>
  </form>
</div>
