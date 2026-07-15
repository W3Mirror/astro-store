import { z } from "zod";

export const configSchema = z.object({
  medusaBackendUrl: z.string(),
  medusaPublishableKey: z.string(),
  medusaRegionId: z.string(),
  // Optional: only set when a store wants Stripe as its checkout payment
  // provider. When empty, the checkout falls back to Medusa's manual
  // provider (`pp_system_default`) and never loads Stripe's client SDK.
  stripePublishableKey: z.string().optional().default(""),
  // Neutral store name shown in the header, page titles, and footer.
  storeName: z.string().optional().default("Your Store"),
  // Optional announcement banner message. Empty/unset hides the banner
  // entirely — it is off by default.
  announcementMessage: z.string().optional().default(""),
  // Optional URL to a per-store site-config JSON endpoint (see
  // `utils/site-config.ts`). When unset, the store runs entirely on the
  // env-based defaults above.
  siteConfigUrl: z.string().optional().default(""),
});

// Shape of the JSON served by the public per-project site-config endpoint.
// Every field is optional/nullable — the overlay only applies fields that
// come back as non-empty strings, falling back to the env-based `config`
// defaults otherwise.
export const SiteConfigOverlayResult = z.object({
  storeName: z.string().nullable().optional(),
  announcementMessage: z.string().nullable().optional(),
  heroHeading: z.string().nullable().optional(),
  heroSubheading: z.string().nullable().optional(),
});

// Medusa calculated price set (see `variant.calculated_price` on /store/products
// when a `region_id` is passed). Amounts are already in the currency's decimal
// unit (e.g. `499.00` for ₹499), not the smallest unit.
export const CalculatedPriceResult = z
  .object({
    calculated_amount: z.number().nullable(),
    original_amount: z.number().nullable(),
    currency_code: z.string().nullable(),
  })
  .nullable();

// A plain price used by <Money /> — either lifted from a calculated price or
// a cart line item.
export const MoneyResult = z.object({
  amount: z.number(),
  currency_code: z.string(),
});

export const ImageResult = z
  .object({
    id: z.string().optional(),
    url: z.string(),
  })
  .nullable();

export const OptionValueResult = z.object({
  id: z.string().optional(),
  value: z.string(),
});

export const ProductOptionResult = z.object({
  id: z.string(),
  title: z.string(),
  values: z.array(OptionValueResult).optional().default([]),
});

export const VariantOptionResult = z.object({
  option_id: z.string().nullable().optional(),
  value: z.string(),
});

export const VariantResult = z.object({
  id: z.string(),
  title: z.string().nullable(),
  sku: z.string().nullable().optional(),
  inventory_quantity: z.number().nullable().optional(),
  allow_backorder: z.boolean().nullable().optional(),
  manage_inventory: z.boolean().nullable().optional(),
  options: z.array(VariantOptionResult).optional().default([]),
  calculated_price: CalculatedPriceResult.optional(),
});

export const ProductResult = z
  .object({
    id: z.string(),
    title: z.string(),
    handle: z.string(),
    description: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
    collection_id: z.string().nullable().optional(),
    images: z.array(ImageResult).optional().default([]),
    options: z.array(ProductOptionResult).optional().default([]),
    variants: z.array(VariantResult).optional().default([]),
  })
  .nullable();

// Shipping/billing address shape accepted and returned by /store/carts and
// /store/orders. Field names mirror Medusa's `AddressPayload` exactly (it's
// a `.strict()` zod object server-side, so extra keys are rejected).
export const AddressResult = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  address_1: z.string().nullable().optional(),
  address_2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export const RegionCountryResult = z.object({
  iso_2: z.string(),
  display_name: z.string(),
});

export const RegionResult = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    currency_code: z.string().optional(),
    countries: z.array(RegionCountryResult).optional().default([]),
  })
  .nullable();

// A shipping option scoped to a cart. Medusa always computes `amount` for
// cart-scoped requests (`GET /store/shipping-options?cart_id=`), regardless
// of the `fields` param, so it's safe to treat as always present.
export const ShippingOptionResult = z.object({
  id: z.string(),
  name: z.string(),
  price_type: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  insufficient_inventory: z.boolean().optional(),
});

export const CartShippingMethodResult = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  shipping_option_id: z.string().nullable().optional(),
});

// A payment session's `data` holds provider-specific state — e.g. Stripe
// stores its PaymentIntent there, including `client_secret`.
export const PaymentSessionResult = z.object({
  id: z.string(),
  provider_id: z.string(),
  status: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const PaymentCollectionResult = z
  .object({
    id: z.string(),
    amount: z.number().nullable().optional(),
    status: z.string().optional(),
    payment_sessions: z.array(PaymentSessionResult).optional().default([]),
  })
  .nullable();

export const PaymentOptionResult = z.object({
  provider: z.enum(["stripe", "cashfree", "razorpay", "manual"]),
  provider_id: z.string(),
  name: z.string(),
  public_config: z.record(z.string(), z.unknown()).optional().default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const PaymentOptionsResult = z.object({
  store_id: z.string(),
  payment_options: z.array(PaymentOptionResult),
});

export const DeliveryTrackingEventResult = z.object({
  status: z.string(),
  code: z.string().optional(),
  description: z.string(),
  location: z.string().optional(),
  occurred_at: z.string(),
});

export const DeliveryTrackingSnapshotResult = z.object({
  tracking_number: z.string(),
  tracking_url: z.string().optional(),
  carrier: z.string(),
  status: z.string(),
  estimated_delivery: z.string().optional(),
  updated_at: z.string(),
  events: z.array(DeliveryTrackingEventResult).optional().default([]),
});

export const OrderTrackingResult = z.object({
  order_id: z.string(),
  shipments: z.array(
    z.object({
      fulfillment_id: z.string(),
      provider_id: z.string(),
      tracking_number: z.string(),
      tracking_url: z.string().optional(),
      carrier: z.string(),
      status: z.string(),
      estimated_delivery: z.string().optional(),
      events: z.array(DeliveryTrackingEventResult).optional().default([]),
      terminal: z.boolean(),
      synced_at: z.string().optional(),
    }),
  ),
});

export const CartLineItemResult = z.object({
  id: z.string(),
  quantity: z.number(),
  title: z.string(),
  thumbnail: z.string().nullable().optional(),
  unit_price: z.number(),
  total: z.number().nullable().optional(),
  subtotal: z.number().nullable().optional(),
  product_id: z.string().nullable().optional(),
  product_handle: z.string().nullable().optional(),
  product_title: z.string().nullable().optional(),
  variant_id: z.string().nullable().optional(),
  variant_title: z.string().nullable().optional(),
  variant_sku: z.string().nullable().optional(),
});

export const CartResult = z
  .object({
    id: z.string(),
    currency_code: z.string(),
    email: z.string().nullable().optional(),
    item_total: z.number().nullable().optional(),
    subtotal: z.number().nullable().optional(),
    shipping_total: z.number().nullable().optional(),
    tax_total: z.number().nullable().optional(),
    total: z.number().nullable().optional(),
    items: z.array(CartLineItemResult).optional().default([]),
    shipping_address: AddressResult.nullable().optional(),
    shipping_methods: z.array(CartShippingMethodResult).optional().default([]),
    payment_collection: PaymentCollectionResult.optional(),
  })
  .nullable();

// Order confirmation page. Medusa denormalizes the same display fields
// (thumbnail, product_handle, unit_price, total, …) onto order line items
// as it does onto cart line items, so the shape matches `CartLineItemResult`.
export const OrderResult = z
  .object({
    id: z.string(),
    display_id: z.number().nullable().optional(),
    email: z.string().nullable().optional(),
    currency_code: z.string(),
    created_at: z.string().nullable().optional(),
    items: z.array(CartLineItemResult).optional().default([]),
    shipping_address: AddressResult.nullable().optional(),
    shipping_methods: z.array(CartShippingMethodResult).optional().default([]),
    item_total: z.number().nullable().optional(),
    shipping_total: z.number().nullable().optional(),
    tax_total: z.number().nullable().optional(),
    total: z.number().nullable().optional(),
  })
  .nullable();
