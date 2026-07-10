<script lang="ts">
  import { cart } from "../../stores/cart";
  import { updateCart } from "../../utils/medusa";

  interface Country {
    iso_2: string;
    display_name: string;
  }

  interface Props {
    countries: Country[];
    onNext: () => void;
  }

  let { countries, onNext }: Props = $props();

  // Prefill from a cart that already went through this step once (e.g. the
  // customer went back to edit their address).
  const existing = cart.get();
  const existingAddress = existing?.shipping_address;

  let email = $state(existing?.email ?? "");
  let firstName = $state(existingAddress?.first_name ?? "");
  let lastName = $state(existingAddress?.last_name ?? "");
  let address1 = $state(existingAddress?.address_1 ?? "");
  let address2 = $state(existingAddress?.address_2 ?? "");
  let city = $state(existingAddress?.city ?? "");
  let province = $state(existingAddress?.province ?? "");
  let postalCode = $state(existingAddress?.postal_code ?? "");
  let countryCode = $state(
    existingAddress?.country_code ?? countries[0]?.iso_2 ?? ""
  );
  let phone = $state(existingAddress?.phone ?? "");

  let submitting = $state(false);
  let error = $state("");

  const inputClass =
    "block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800";
  const labelClass = "block text-sm font-medium text-zinc-700";

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const cartId = cart.get()?.id;
    if (!cartId) {
      error =
        "Your cart could not be found. Please go back to the shop and try again.";
      return;
    }

    submitting = true;
    error = "";

    const shippingAddress = {
      first_name: firstName,
      last_name: lastName,
      address_1: address1,
      address_2: address2 || null,
      city,
      province: province || null,
      postal_code: postalCode,
      country_code: countryCode,
      phone: phone || null,
    };

    try {
      const updated = await updateCart(cartId, {
        email,
        shipping_address: shippingAddress,
        billing_address: shippingAddress,
      });

      if (updated) {
        cart.set(updated);
      }

      onNext();
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please check your details and try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-8">
  <div>
    <h2 class="text-lg font-semibold text-zinc-800">Contact</h2>
    <div class="mt-4">
      <label class={labelClass} for="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autocomplete="email"
        class="{inputClass} mt-1"
        bind:value={email}
      />
    </div>
  </div>

  <div>
    <h2 class="text-lg font-semibold text-zinc-800">Shipping address</h2>
    <div class="mt-4 grid grid-cols-2 gap-4">
      <div>
        <label class={labelClass} for="first-name">First name</label>
        <input
          id="first-name"
          required
          autocomplete="given-name"
          class="{inputClass} mt-1"
          bind:value={firstName}
        />
      </div>
      <div>
        <label class={labelClass} for="last-name">Last name</label>
        <input
          id="last-name"
          required
          autocomplete="family-name"
          class="{inputClass} mt-1"
          bind:value={lastName}
        />
      </div>
      <div class="col-span-2">
        <label class={labelClass} for="address1">Address</label>
        <input
          id="address1"
          required
          autocomplete="address-line1"
          class="{inputClass} mt-1"
          bind:value={address1}
        />
      </div>
      <div class="col-span-2">
        <label class={labelClass} for="address2"
          >Apartment, suite, etc. (optional)</label
        >
        <input
          id="address2"
          autocomplete="address-line2"
          class="{inputClass} mt-1"
          bind:value={address2}
        />
      </div>
      <div>
        <label class={labelClass} for="city">City</label>
        <input
          id="city"
          required
          autocomplete="address-level2"
          class="{inputClass} mt-1"
          bind:value={city}
        />
      </div>
      <div>
        <label class={labelClass} for="province">State / Province</label>
        <input
          id="province"
          autocomplete="address-level1"
          class="{inputClass} mt-1"
          bind:value={province}
        />
      </div>
      <div>
        <label class={labelClass} for="postal-code">Postal code</label>
        <input
          id="postal-code"
          required
          autocomplete="postal-code"
          class="{inputClass} mt-1"
          bind:value={postalCode}
        />
      </div>
      <div>
        <label class={labelClass} for="country">Country</label>
        <select
          id="country"
          required
          autocomplete="country"
          class="{inputClass} mt-1"
          bind:value={countryCode}
        >
          {#each countries as country (country.iso_2)}
            <option value={country.iso_2}>{country.display_name}</option>
          {/each}
        </select>
      </div>
      <div class="col-span-2">
        <label class={labelClass} for="phone">Phone (optional)</label>
        <input
          id="phone"
          type="tel"
          autocomplete="tel"
          class="{inputClass} mt-1"
          bind:value={phone}
        />
      </div>
    </div>
  </div>

  {#if countries.length === 0}
    <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      This region has no countries configured for shipping — please contact
      the store.
    </p>
  {/if}

  {#if error}
    <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  {/if}

  <button
    type="submit"
    class="button w-full"
    disabled={submitting || countries.length === 0}
  >
    {submitting ? "Saving..." : "Continue to shipping"}
  </button>
</form>
