const forbidden = () =>
  new Response("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

/**
 * Reject browser account mutations that did not originate from this storefront.
 *
 * Origin is authoritative when present. Clients that omit Origin must provide the
 * browser-generated Sec-Fetch-Site header and only `same-origin` is accepted.
 * Comparing with request.url keeps the check aligned with Astro's proxy-aware URL.
 *
 * @param {Request} request
 * @returns {Response | null}
 */
export function rejectCrossOriginAccountMutation(request) {
  let requestOrigin;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return forbidden();
  }

  const originHeader = request.headers.get("Origin");
  if (originHeader !== null) {
    try {
      const origin = new URL(originHeader);
      if (origin.origin !== originHeader || origin.origin !== requestOrigin) {
        return forbidden();
      }
    } catch {
      return forbidden();
    }
    return null;
  }

  return request.headers.get("Sec-Fetch-Site") === "same-origin"
    ? null
    : forbidden();
}
