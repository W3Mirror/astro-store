# `.agents/w3dev/` — platform-managed store contract

`store.json` is written by the w3dev store platform (ecomm-ai) when it
creates or updates this store's repository. **Do not hand-edit it** — the
platform overwrites it, and the platform's code tools refuse to edit
anything under `.agents/w3dev/`.

It holds the store's public identity and how the platform builds it:

| Key | Meaning |
| --- | --- |
| `version` | Contract schema version (currently `1`). |
| `scripts.build` / `scripts.preview` | `package.json` scripts the platform runs: `build:vercel` (writes `output`) and `preview:dev` (listens on `$PORT`). |
| `output` | Build Output API v3 directory produced by `scripts.build`. |
| `features.siteConfig` / `features.testSite` | Whether the storefront reads the platform site config and supports a test twin. |
| `medusa.*` | Public Medusa identity: backend URL, publishable key (`pk_…`), region id (`reg_…`), default country (ISO-2). |
| `store.name` | Store name shown in the header, titles and footer. |
| `siteConfigUrl` | Per-store public site-config endpoint. |

Only public values belong here — never secrets. An empty string means
"unset". The test/live environment is **not** in this file: it comes only
from the `STORE_ENVIRONMENT` build env var (see `DEPLOY.md`).

The storefront resolves each value as: env var (the existing `PUBLIC_*`
names) when set → this file → the built-in default. See
`src/utils/store-contract.js`.
