import { z } from "zod";
import type { AstroGlobal } from "astro";
import { config } from "./config";
import { ProductResult } from "./schemas";
import { previewEndpointUrl } from "./preview.js";

// Server-side half of preview mode (see `preview.js` for the contract).
// `middleware.ts` puts a `PreviewRequest` on `Astro.locals` ONLY when the
// request carries a preview token (the `?preview=` param or the preview
// cookie); pages call `getPreview(Astro)` and get `null` otherwise, so a
// normal request never fetches, merges, or renders anything preview.

const PREVIEW_FETCH_TIMEOUT_MS = 8_000;

// The builder's preview endpoint response. Every product is parsed with
// the SAME `ProductResult` schema live Store API products go through, so a
// preview product can never reach a component in a shape a live one
// couldn't.
export const PreviewResponseResult = z.object({
  link: z.object({
    id: z.string(),
    expires_at: z.string(),
    scope: z.enum(["store", "products"]),
  }),
  entries: z.array(
    z.object({
      state: z.enum(["draft", "pending"]),
      summary: z.string().nullable().optional(),
      product: ProductResult.transform((product, ctx) => {
        if (!product) {
          ctx.addIssue({ code: "custom", message: "missing product" });
          return z.NEVER;
        }
        return product;
      }),
    }),
  ),
});

export type PreviewData = z.infer<typeof PreviewResponseResult>;

export type PreviewStatus =
  | { kind: "active"; data: PreviewData }
  // The token was rejected (expired, revoked, tampered) — the page renders
  // live, with a banner saying so.
  | { kind: "invalid" }
  // The builder couldn't be reached — renders live, with a banner.
  | { kind: "unavailable" };

export type PreviewRequest = {
  token: string;
  status: () => Promise<PreviewStatus>;
};

const fetchPreview = async (token: string): Promise<PreviewStatus> => {
  const endpoint = previewEndpointUrl(config.siteConfigUrl);
  if (!endpoint) return { kind: "unavailable" };
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "invalid" };
    }
    if (!response.ok) {
      console.error(`[preview] endpoint status=${response.status}`);
      return { kind: "unavailable" };
    }
    return {
      kind: "active",
      data: PreviewResponseResult.parse(await response.json()),
    };
  } catch (error) {
    console.error("[preview] failed to load preview data", error);
    return { kind: "unavailable" };
  }
};

// One fetch per request, however many components ask.
export const createPreviewRequest = (token: string): PreviewRequest => {
  let pending: Promise<PreviewStatus> | null = null;
  return {
    token,
    status: () => (pending ??= fetchPreview(token)),
  };
};

/** Preview data for this request, or `null` (no token, or not usable). */
export const getPreview = async (
  Astro: Pick<AstroGlobal, "locals">,
): Promise<PreviewData | null> => {
  const request = Astro.locals.preview;
  if (!request) return null;
  const status = await request.status();
  return status.kind === "active" ? status.data : null;
};
