<script lang="ts">
  import type { z } from "zod";
  import type { MoneyResult } from "../utils/schemas";

  interface Props {
    price?: z.infer<typeof MoneyResult>;
    showCurrency?: boolean;
  }

  let { price, showCurrency = false }: Props = $props();

  // Medusa returns amounts already in the currency's decimal unit
  // (e.g. `499` for ₹499), so no cent-to-unit conversion is needed here.
  let formatPrice = $derived.by(() =>
    price
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: price.currency_code || "INR",
          currencyDisplay: showCurrency ? "symbol" : "narrowSymbol",
        }).format(price.amount)
      : ""
  );
</script>

<span>
  {formatPrice}
</span>
