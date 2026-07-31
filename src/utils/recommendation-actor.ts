const ACTOR_KEY = "recommendation_actor_v1";

/** Anonymous local token only. Medusa hashes it per store before persistence. */
export function getRecommendationActor() {
  if (typeof window === "undefined") return "";
  let actor = localStorage.getItem(ACTOR_KEY);
  if (!actor) {
    actor = crypto.randomUUID();
    localStorage.setItem(ACTOR_KEY, actor);
  }
  return actor;
}

export async function captureRecommendationSignal(input: {
  event_type: "view" | "cart";
  product_id: string;
  related_product_ids?: string[];
  idempotency_key: string;
}) {
  const actor = getRecommendationActor();
  if (!actor) return;
  const response = await fetch("/api/recommendations/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, actor_key: actor }),
  });
  if (!response.ok) throw new Error("Recommendation signal was not accepted");
}
