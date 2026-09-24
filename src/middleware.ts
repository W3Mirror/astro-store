import { defineMiddleware } from "astro:middleware";
import { config } from "./utils/config";

// Sets the X-Robots-Tag response header on every request when this build is
// the test twin (PUBLIC_STORE_ENVIRONMENT=test), so crawlers are told not
// to index it even for responses that skip BaseLayout's <meta name="robots">
// (e.g. API routes, non-HTML responses). The live build (the default) is
// untouched — this middleware is then a pure pass-through.
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  if (config.storeEnvironment === "test") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
});
