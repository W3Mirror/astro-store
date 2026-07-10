import { z } from "zod";

export const configSchema = z.object({
  medusaBackendUrl: z.string(),
  medusaPublishableKey: z.string(),
  medusaRegionId: z.string(),
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
    total: z.number().nullable().optional(),
    items: z.array(CartLineItemResult).optional().default([]),
  })
  .nullable();
