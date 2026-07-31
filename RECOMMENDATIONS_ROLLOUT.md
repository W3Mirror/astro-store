# Recommendations rollout

Keep `PUBLIC_RECOMMENDATIONS_ENABLED=false` until the backend's additive
`Migration20260731180000` is applied and `MEDUSA_FF_RECOMMENDATIONS=true` has
been verified in a sandbox. Then enable this storefront flag for one store,
confirm product views/cart additions are accepted, and confirm recommendation
reasons plus explicit promotion application before checkout.

The browser stores only a random anonymous token. Astro accepts signals through
a same-origin route; Medusa hashes the token per store and persists no contact
details. Disable the public flag to remove capture/rendering immediately; the
existing collection-based shelf remains as the bounded fallback.
