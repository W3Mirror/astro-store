<script lang="ts">
  // Renders nothing — just resets the (now-completed) cart on the order
  // confirmation page so the header's cart icon and drawer don't keep
  // showing items that have already been ordered.
  import { onMount } from "svelte";
  import { clearCart } from "../../stores/cart";

  onMount(() => {
    clearCart();
  });
</script>
