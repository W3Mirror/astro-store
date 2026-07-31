<script lang="ts">
  import { onMount } from "svelte";
  import { captureRecommendationSignal } from "../utils/recommendation-actor";

  let { productId }: { productId: string } = $props();

  onMount(() => {
    const pageKey = `recommendation-view:${productId}`;
    let idempotencyKey = sessionStorage.getItem(pageKey);
    if (!idempotencyKey) {
      idempotencyKey = `view:${productId}:${crypto.randomUUID()}`;
      sessionStorage.setItem(pageKey, idempotencyKey);
    }
    void captureRecommendationSignal({
      event_type: "view",
      product_id: productId,
      idempotency_key: idempotencyKey,
    }).catch(() => undefined);
  });
</script>
