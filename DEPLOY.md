# Deploying this template

Production target: **Cloudflare Workers** (static assets + SSR Worker, via
`@astrojs/cloudflare`). This doc covers the env contract, the local/CI
sandbox preview flow, and what a Workers-for-Platforms (WFP) upload expects.

A second, per-store publish path targeting **Vercel** (Build Output API v3,
via `@astrojs/vercel`) also exists — see "Vercel build target" below. It
reuses the same env contract; everything in this doc about `PUBLIC_*`
variables being build-time-only applies to it too.

## Store contract (`.agents/w3dev/store.json`)

Every store repo carries `.agents/w3dev/store.json`, written by the w3dev
platform (not by hand, and not editable by the platform's code tools — see
`.agents/w3dev/README.md`). It holds the store's **public** identity and
the uniform scripts the platform runs:

```json
{
  "version": 1,
  "scripts": { "build": "build:vercel", "preview": "preview:dev" },
  "output": ".vercel/output",
  "features": { "siteConfig": true, "testSite": true },
  "medusa": { "backendUrl": "", "publishableKey": "", "regionId": "", "defaultCountry": "" },
  "store": { "name": "" },
  "siteConfigUrl": ""
}
```

Each value resolves (`src/utils/store-contract.js`, used by
`src/utils/config.ts`) as:

1. **env var**, when set to a non-empty string — the existing names below
   (`PUBLIC_MEDUSA_BACKEND_URL`, `PUBLIC_MEDUSA_PUBLISHABLE_KEY`,
   `PUBLIC_MEDUSA_REGION_ID`, `PUBLIC_STORE_NAME`,
   `PUBLIC_SITE_CONFIG_URL`). A build that injects these behaves exactly
   as before;
2. else the **store.json** value, when non-empty (`""` means unset);
3. else the **existing default** (`configSchema` in `src/utils/schemas.ts`).

`medusa.defaultCountry` has no env var; it is exposed as
`config.defaultCountry` (lowercase ISO-2, `""` when unset).

store.json is imported statically, so it is bundled at build time (SSR and
client code alike) — editing it needs a rebuild/dev-server restart. Both
astro configs install the `storeContract` Vite plugin
(`src/utils/store-contract-vite.mjs`), which validates the file before the
build or dev server starts: an unknown `version`, a non-http(s) URL, a key
that isn't `pk_…`, a region that isn't `reg_…`, or a country that isn't a
lowercase 2-letter code fails the build with the offending field named.

**The environment (test vs live) is never in store.json.** It is env only:
`STORE_ENVIRONMENT` (`live` | `test`, preferred; read from the process env
or `.env*` by the Vite plugin and inlined as a compile-time constant), then
the existing `PUBLIC_STORE_ENVIRONMENT` (below) when `STORE_ENVIRONMENT` is
unset or empty. Any other `STORE_ENVIRONMENT` value fails the build.

## Env contract

The Medusa config can come from three `PUBLIC_`-prefixed variables (see
`.env.example`); when one is unset or empty, the store contract's value is
used instead (see above):

| Variable                        | Example                       | Notes                                                                                   |
| ------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `PUBLIC_MEDUSA_BACKEND_URL`     | `https://backend.example.com` | Medusa server base URL, no trailing slash.                                              |
| `PUBLIC_MEDUSA_PUBLISHABLE_KEY` | `pk_...`                      | Store → Settings → API Key Management. Must be scoped to a sales channel with products. |
| `PUBLIC_MEDUSA_REGION_ID`       | `reg_...`                     | Settings → Regions. Used to request calculated prices.                                  |

Optional flag, same build-time contract:

| Variable                   | Example | Notes                                                                                                                                                                                              |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORE_ENVIRONMENT`        | `test`  | Preferred name for the flag below (`live` or `test`). Wins over `PUBLIC_STORE_ENVIRONMENT` when non-empty. |
| `PUBLIC_STORE_ENVIRONMENT` | `test`  | Set to `test` to build this deployment as the test twin: visible "Test store — orders aren't real" banner, `X-Robots-Tag: noindex, nofollow` on every response, and a fully disallowing `robots.txt`. Unset (or anything other than `test`) is the live build — unchanged. |

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
| `bun run preview:dev` | Same as `dev`; plain `astro dev --host --port ${PORT:-3000}` (listens on `$PORT`, default 3000), no Cloudflare runtime emulation. Used by the sandbox-preview flow below. |
| `bun run build`       | `astro build` — same as `build:cf` today; kept for parity with the Astro convention.                                                                             |
| `bun run build:cf`    | `astro build` targeting the Cloudflare adapter (`output: "server"`, `adapter: cloudflare()`). Produces `dist/_worker.js/index.js` + static assets under `dist/`. |
| `bun run preview`     | `wrangler dev` — runs the built Worker against local `workerd`, with `platformProxy` emulating bindings (`ASSETS`, KV). Run `build:cf` first.                    |
| `bun run deploy`      | `wrangler deploy` — real deploy to your Cloudflare account/namespace using `wrangler.jsonc`.                                                                     |

## Vercel build target

| Script                 | What it does                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run build:vercel` | `astro build --config astro.config.vercel.mjs` — same `output: "server"` SSR mode, `@astrojs/vercel` adapter. Produces `.vercel/output` (Build Output API v3: `static/`, `functions/_render.func`, `config.json`). |

Kept as a separate config file (`astro.config.vercel.mjs`), not an
env-switched adapter in `astro.config.mjs`, so the default `bun run build` /
`build:cf` / `wrangler` path above is untouched. Pinned to
`@astrojs/vercel@9.0.5` — versions `>=10` require `astro@^6`/`^7`, and this
template is on `astro@5.18.1`.

The per-store publish pipeline (`web-app/ecomm-ai`, `packages/sandbox`)
runs `bun run build:vercel` inside a build sandbox with the same
`PUBLIC_MEDUSA_*` / `PUBLIC_STORE_NAME` / `PUBLIC_SITE_CONFIG_URL` env vars
as the Cloudflare path, then ships `.vercel/output` with
`vercel deploy --prebuilt` — no Vercel build minutes consumed. The
runtime-fetched `PUBLIC_SITE_CONFIG_URL` overlay (`src/utils/site-config.ts`)
uses plain `fetch` and needs no adapter-specific code; it works unmodified
in Vercel's Node serverless functions. The allow-listed overlay also accepts
`storefrontPreset` (`minimal`, `editorial`, or `conversion`); missing or invalid
values resolve to `minimal`, so older store configs remain compatible.

For a store's **test twin**, the publish pipeline runs this same
`build:vercel` command with `PUBLIC_STORE_ENVIRONMENT=test` (or the
preferred `STORE_ENVIRONMENT=test`) added to that build's env — and only that
build's env; the live build must never set it (or sets
`STORE_ENVIRONMENT=live`).
That flips on the test-store banner, forces noindex on every response
(`src/middleware.ts` sets `X-Robots-Tag`; `BaseLayout.astro` forces the
`<meta name="robots">` tag; `src/pages/robots.txt.ts` disallows everything),
and otherwise builds and deploys identically to the live storefront (same
adapter, same Build Output API artifact, same `vercel deploy --prebuilt`
step, just pointed at the test store's publishable key/region).

## First-paint contract

The home response is edge-cacheable for 60 seconds, cart islands hydrate on
`client:idle`, and only the first catalog image is eager/high-priority. Keep
these guarantees measurable with `pnpm test:first-paint`; run it alongside
`pnpm typecheck` and both production builds when changing the home page.

## Preview links (drafts and staged changes)

A storefront URL with `?preview=<token>` (minted by the store builder's
`create_preview_link`) renders the store's draft products and staged product
changes — no extra env var: the builder's preview endpoint is derived from
`PUBLIC_SITE_CONFIG_URL` (`src/utils/preview.js`'s `previewEndpointUrl`), and
the token is only ever sent server-to-server. The token is kept in an
httpOnly session cookie (`store_preview`); `?preview=exit` ends preview.
Preview responses are `private, no-store`, carry no CDN cache headers and are
`noindex`; normal requests are untouched (see `src/middleware.ts` and
`scripts/preview-mode.test.mjs`).

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
- `--host` (bind `0.0.0.0`, not just `localhost`) and `--port 3000` are
  required: Vercel Sandbox only forwards traffic to a process actually
  listening on the sandbox's exposed port (`3000`, matching `PREVIEW_PORT`
  in `packages/sandbox` in `web-app/ecomm-ai`) on a non-loopback address.
  Plain `astro dev` defaults to `localhost:4321`, which the sandbox can
  never reach — the preview URL 502s forever in that case.

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

# Storefront search metadata

When `PUBLIC_SITE_CONFIG_URL` returns an approved `seo` profile, the runtime emits canonical, OpenGraph, Twitter, robots, sitemap, structured-data, About/FAQ, and `llms.txt` output. Draft profiles are not returned by ecomm-ai and therefore never affect a deployment.

After deployment, verify `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/about`, `/faq` (when configured), homepage Organization/WebSite JSON-LD, and one product's Product JSON-LD. Canonical URLs use the request origin so the production Vercel domain or attached custom domain remains authoritative. Keep `PUBLIC_SITE_CONFIG_URL` reachable at runtime; the existing safe fallback keeps the store available but cannot supply project-specific metadata.

# Provider runtime safety

Payment and shipping credentials remain in the Medusa backend. The storefront
receives only provider IDs, capability metadata, and explicitly public checkout
configuration. PayU checkout posts the server-generated signed form directly to
PayU and returns through the backend callback; no merchant salt is exposed.

When enabling the launch provider matrix, add the storefront origin to the
backend `STORE_CORS` so the PayU callback can perform its allowlisted redirect.
