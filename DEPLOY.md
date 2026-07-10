# Deploying this template

Production target: **Cloudflare Workers** (static assets + SSR Worker, via
`@astrojs/cloudflare`). This doc covers the env contract, the local/CI
sandbox preview flow, and what a Workers-for-Platforms (WFP) upload expects.

## Env contract

All Medusa config lives in three `PUBLIC_`-prefixed variables (see
`.env.example`):

| Variable                        | Example                       | Notes                                                                                   |
| ------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `PUBLIC_MEDUSA_BACKEND_URL`     | `https://backend.example.com` | Medusa server base URL, no trailing slash.                                              |
| `PUBLIC_MEDUSA_PUBLISHABLE_KEY` | `pk_...`                      | Store → Settings → API Key Management. Must be scoped to a sales channel with products. |
| `PUBLIC_MEDUSA_REGION_ID`       | `reg_...`                     | Settings → Regions. Used to request calculated prices.                                  |

**These are build-time values, not runtime ones.** `src/utils/config.ts`
reads them via `import.meta.env`, which Vite inlines into the JS bundle
when `astro build` runs — they are not read from `wrangler.jsonc` `vars` or
`Astro.locals.runtime.env` at request time. Practically this means:

- Local dev (`bun run dev` / `bun run preview:dev`): put them in a `.env`
  file (gitignored) at the template root, copied from `.env.example`.
- Any build that produces the artifact you deploy (`bun run build:cf` /
  `pnpm run build:cf`) must have them set in its environment — as real env
  vars, or a `.env` file present at build time. If your CI/build pipeline
  doesn't set them, the build won't fail (no page prerenders at build time
  today), but the deployed Worker will 500 with a Zod validation error on
  every request.
- The `vars` block in `wrangler.jsonc` is deliberately left as placeholders.
  It documents the contract for `wrangler dev` / `wrangler deploy --dry-run`
  and Workers dashboard/API configuration, but does **not** feed the
  storefront's actual config — don't rely on editing it alone to point the
  storefront at a different backend. If you later move config to be
  runtime-read (`Astro.locals.runtime.env`), then the `vars` block (or KV /
  Secrets Store bindings) becomes load-bearing and should replace the
  build-time-only wiring described here.

## Scripts

| Script                | What it does                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`         | `astro dev` — local dev server, Node runtime.                                                                                                                    |
| `bun run preview:dev` | Same as `dev`; plain `astro dev`, no Cloudflare runtime emulation. Used by the sandbox-preview flow below.                                                       |
| `bun run build`       | `astro build` — same as `build:cf` today; kept for parity with the Astro convention.                                                                             |
| `bun run build:cf`    | `astro build` targeting the Cloudflare adapter (`output: "server"`, `adapter: cloudflare()`). Produces `dist/_worker.js/index.js` + static assets under `dist/`. |
| `bun run preview`     | `wrangler dev` — runs the built Worker against local `workerd`, with `platformProxy` emulating bindings (`ASSETS`, KV). Run `build:cf` first.                    |
| `bun run deploy`      | `wrangler deploy` — real deploy to your Cloudflare account/namespace using `wrangler.jsonc`.                                                                     |

## Sandbox-preview flow (Vercel Sandbox)

The Vercel-Sandbox-based preview flow (used for quick reviewer/agent
previews) runs `bun run preview:dev`, i.e. **plain `astro dev`**, not
`wrangler dev`. This is intentional:

- `wrangler dev` / `wrangler preview` boot a real `workerd` isolate, which
  needs process-level sandboxing primitives (its own seccomp/namespace
  setup) that a Vercel Sandbox microVM does not expose. It will fail to
  start there.
- Plain `astro dev` is pure Node + Vite, no `workerd` involved, and boots
  reliably inside a microVM. It does not exercise Cloudflare-specific
  bindings (`ASSETS`, KV, `platformProxy`), but this template doesn't use
  any today (no `Astro.locals.runtime`, no sessions, no KV) — see "No
  Node-only APIs" below for why that's safe to assume stays true.
- Requires the same `.env` / env vars as local dev (see "Env contract").

If you add code that depends on Cloudflare-only bindings
(`Astro.locals.runtime.env`, KV, D1, etc.), it will work under `bun run
preview` (`wrangler dev`) but silently no-op or throw under `bun run
preview:dev` (plain `astro dev`) — the sandbox-preview flow will not catch
regressions in that code path. Keep such code behind a runtime check, or
add a Node-side fallback, if you want the sandbox preview to stay
representative.

## No Node-only APIs in SSR paths

All SSR code (`src/pages/**`, `src/components/**`, `src/utils/**`,
`src/stores/**`) is audited to avoid `fs`, `node:*` imports, and
`process.env` — it only uses `fetch`, `import.meta.env`, and standard Web
APIs, so it runs unmodified on the Workers runtime. `astro:assets`
(`<Image>` / `getImage`, which pull in `sharp`) is not used; images are
served as plain `<img>` tags via `ResponsiveImage.svelte` pointing directly
at Medusa-hosted URLs, so no server-side image transform runs at request
time. `astro.config.mjs` sets `imageService: "compile"` on the adapter as a
defensive default in case that changes later — it resolves image transforms
at build time instead of pulling `sharp`/`squoosh` into the Worker.

## Workers-for-Platforms (WFP) upload expectations

If this Worker is deployed via a Workers-for-Platforms dispatch namespace
(multi-tenant, one Worker script per store) rather than
`wrangler deploy` directly to a standard account:

1. **Build first, upload the artifact** — WFP's script-upload API expects
   the already-built Worker (the `main` entry plus its associated modules)
   and the static assets manifest; it does not run `astro build` for you.
   Run `bun run build:cf` (or `pnpm run build:cf`) in your CI/build step,
   then upload `dist/_worker.js/index.js` and `dist/` (assets, ignoring
   `_worker.js`/`_routes.json` per `.assetsignore`) via the WFP API/SDK,
   not the `wrangler.jsonc` in this repo directly.
2. **Script name must be unique per store/tenant** within the dispatch
   namespace — the `name` field in `wrangler.jsonc` (`astro-store`) is a
   local-dev/dry-run placeholder; the WFP upload call sets its own script
   name (commonly derived from the store's slug/domain).
3. **Env vars are per-script metadata, not global** — `PUBLIC_MEDUSA_*`
   must be supplied as build-time env vars to whatever runs `build:cf` for
   that tenant (see "Env contract" above), since they're compiled into the
   JS bundle. If your WFP pipeline builds once and deploys many tenants
   from the same artifact, either build per-tenant or move this config to
   be read at runtime from `Astro.locals.runtime.env` / a WFP-provided
   binding instead of `import.meta.env`.
4. **Assets binding (`ASSETS`)** — WFP supports the standard `assets`
   binding used here; make sure whatever upload path you use forwards
   `dist/` (minus `_worker.js`/`_routes.json`) as the assets bundle and
   keeps the `ASSETS` binding name so no code changes are needed.
5. **`compatibility_date` / `compatibility_flags`** — keep these in sync
   with what the dispatch namespace's runtime supports; WFP dispatch
   workers can pin an older compatibility date than your account default.

## Local verification

```bash
bun install                 # or: pnpm install
cp .env.example .env        # fill in real Medusa values for a live preview
bun run build:cf            # astro build (Cloudflare adapter)
npx wrangler deploy --dry-run   # validates wrangler.jsonc + built Worker without deploying
bun run preview             # wrangler dev, real workerd + ASSETS binding
```
