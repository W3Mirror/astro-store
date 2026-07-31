import type { APIRoute } from "astro";
import { rejectCrossOriginAccountMutation } from "../../../utils/account-mutation-security.js";
import { config } from "../../../utils/config";
import { customerRequest } from "../../../utils/customer-account";
import { RecommendationSignalInput } from "../../../utils/schemas";

export const POST: APIRoute = async ({ request }) => {
  const originError = rejectCrossOriginAccountMutation(request);
  if (originError) return originError;
  if (!config.recommendationsEnabled)
    return new Response("Not found", { status: 404 });
  const parsed = RecommendationSignalInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return new Response("Invalid signal", { status: 400 });
  }
  try {
    const result = await customerRequest<Record<string, unknown>>(
      "/store/recommendations/signals",
      { method: "POST", body: parsed.data },
    );
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Recommendation signal forwarding failed", error);
    return new Response("Signal unavailable", { status: 502 });
  }
};
