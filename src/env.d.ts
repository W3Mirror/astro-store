/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

declare namespace App {
  interface Locals {
    // Set by `middleware.ts` only when the request carries a preview token.
    preview?: import("./utils/preview-context").PreviewRequest;
  }
}
