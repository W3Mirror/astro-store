import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
import svelte from "@astrojs/svelte";

// Vercel build target (Build Output API v3, `.vercel/output`), used by the
// per-store publish pipeline in `web-app/ecomm-ai` (prebuilt `vercel
// deploy --prebuilt`, no Vercel build minutes consumed). Kept as a separate
// config file rather than an env-switched adapter in `astro.config.mjs` so
// the Cloudflare path (default `bun run build` / `build:cf`, `wrangler
// dev`/`deploy`) is untouched. Pinned to `@astrojs/vercel@9.0.5`: versions
// >=10 require `astro@^6`/`^7`, and this template is on `astro@5.18.1`.
//
// Same env contract as the Cloudflare path (see DEPLOY.md): `PUBLIC_*`
// vars in `src/utils/config.ts` are inlined at build time by Vite, so they
// must be set wherever `astro build --config astro.config.vercel.mjs` /
// `bun run build:vercel` runs. `PUBLIC_SITE_CONFIG_URL`
// (`src/utils/site-config.ts`) is fetched per-request via plain `fetch`,
// which works unmodified in Vercel's Node serverless functions.
export default defineConfig({
  output: "server",
  adapter: vercel(),

  integrations: [svelte()],

  vite: {
    plugins: [tailwindcss()],
  },
});
