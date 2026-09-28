import { defineMiddleware } from "astro:middleware";
import { config } from "./utils/config";
import { createPreviewRequest } from "./utils/preview-context";
import {
  PREVIEW_COOKIE,
  PREVIEW_EXIT_VALUE,
  PREVIEW_PARAM,
  applyPreviewResponseHeaders,
  isPlausiblePreviewToken,
  withoutPreviewParam,
} from "./utils/preview.js";

// 1. Test twin: sets the X-Robots-Tag response header on every request when
//    this build is the test twin (PUBLIC_STORE_ENVIRONMENT=test), so
//    crawlers are told not to index it even for responses that skip
//    BaseLayout's <meta name="robots"> (e.g. API routes, non-HTML
//    responses). The live build (the default) is untouched by this.
// 2. Preview mode (see `utils/preview.js`): `?preview=<token>` starts it
//    and stores the token in a session cookie; `?preview=exit` ends it. A
//    request with neither the param nor the cookie is a pass-through —
//    `Astro.locals.preview` stays unset and nothing preview is rendered.
export const onRequest = defineMiddleware(async (context, next) => {
  const param = context.url.searchParams.get(PREVIEW_PARAM);

  if (param === PREVIEW_EXIT_VALUE) {
    context.cookies.delete(PREVIEW_COOKIE, { path: "/" });
    const response = new Response(null, {
      status: 302,
      headers: { Location: withoutPreviewParam(context.url.href) },
    });
    applyPreviewResponseHeaders(response.headers);
    return response;
  }

  let token: string | null = null;
  if (param !== null) {
    if (isPlausiblePreviewToken(param)) {
      token = param;
      context.cookies.set(PREVIEW_COOKIE, param, {
        path: "/",
        httpOnly: true,
        secure: context.url.protocol === "https:",
        sameSite: "lax",
      });
    }
  } else {
    const cookie = context.cookies.get(PREVIEW_COOKIE)?.value;
    if (isPlausiblePreviewToken(cookie)) token = cookie ?? null;
  }
  if (token) context.locals.preview = createPreviewRequest(token);

  const response = await next();

  if (config.storeEnvironment === "test") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  // Any request that so much as mentions preview is kept out of every
  // cache, whatever the page itself asked for.
  if (param !== null || token) {
    applyPreviewResponseHeaders(response.headers);
    const status = await context.locals.preview?.status();
    if (status?.kind === "invalid") {
      context.cookies.delete(PREVIEW_COOKIE, { path: "/" });
    }
  }

  return response;
});
