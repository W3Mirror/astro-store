import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { storeContract } from "./src/utils/store-contract-vite.mjs";

// https://astro.build/config
import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "compile",
    platformProxy: {
      enabled: true,
    },
  }),

  integrations: [svelte()],

  vite: {
    plugins: [
      tailwindcss(),
      // `.agents/w3dev/store.json` + STORE_ENVIRONMENT (see DEPLOY.md).
      storeContract({ root: new URL(".", import.meta.url) }),
    ],
    server: {
      // Vercel Sandbox previews are reached through a dynamic
      // `sb-<id>.vercel.run` domain proxied to the dev server's port, and
      // Boat sandbox previews through a `.on.boat.dev` domain. Vite's dev
      // server rejects requests for hosts it doesn't recognize (DNS
      // rebinding protection), so without both entries the sandbox-preview
      // flow gets a 403 "Blocked request" from Vite even once the server is
      // correctly listening on the right host/port.
      allowedHosts: [".vercel.run", ".on.boat.dev"],
    },
  },
});
