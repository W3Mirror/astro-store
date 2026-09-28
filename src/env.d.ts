/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

// Compile-time constant defined by the `storeContract` Vite plugin
// (`utils/store-contract-vite.mjs`): the build's `STORE_ENVIRONMENT`.
declare const __W3DEV_STORE_ENVIRONMENT__: string | undefined;

declare namespace App {
  interface Locals {
    // Set by `middleware.ts` only when the request carries a preview token.
    preview?: import("./utils/preview-context").PreviewRequest;
  }
}
