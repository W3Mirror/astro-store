# Astro starter theme to build a headless ecommerce website with Medusa

The theme is built with Svelte but you can use any framework you like (React, Vue, Solid etc.) thanks to Astro.
Tailwind UI free components are used for the design.

![astro_shopify_preview](https://user-images.githubusercontent.com/10447155/214480671-8380f410-cbfb-4f53-a6bb-5c744073e2f2.jpg)

## 🧑‍🚀 Where to start

1. Create a `.env` file based on `.env.example` with your Medusa backend URL, publishable API key and region ID
2. The credentials are used inside the `/utils/config.ts` file
3. Run `npm install` or `yarn` or `pnpm install`
4. Run `npm run dev` or `yarn run dev` or `pnpm run dev`

## Medusa Configuration Guide

- Create or use an existing [Medusa](https://medusajs.com) backend.
- In the Medusa Admin, go to Settings → API Key Management and create (or copy) a publishable API key, then copy it to `PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- Make sure the publishable key is associated with a sales channel that has products.
- Copy a region's ID (Settings → Regions) to `PUBLIC_MEDUSA_REGION_ID` — it's used to request calculated prices.
- Payment methods are discovered from the backend's per-store payment plugin configuration; gateway credentials and public keys do not belong in this frontend's environment.
- Delivery tracking is provided by the backend's configured fulfillment plugins and appears on the order page when available.

### Medusa Troubleshooting

- If products come back with no prices, double-check `PUBLIC_MEDUSA_REGION_ID` matches a region with a price list/currency configured for your products.
- If you get a 401/403, verify the publishable API key is valid and scoped to a sales channel that includes your products.

## 🚀 Project Structure

Inside the project, you'll see the following folders and files:

```
/
├── public/
├── src/
│   └── components/
│       └── Header.astro
│   └── layouts/
│       └── BaseLayout.astro
│   └── pages/
│       └── index.astro
│   └── stores/
│       └── cart.ts
│   └── styles/
│       └── global.css
│   └── utils/
│       └── medusa.ts
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                | Action                                           |
| :--------------------- | :----------------------------------------------- |
| `npm install`          | Installs dependencies                            |
| `npm run dev`          | Starts local dev server at `localhost:3000`      |
| `npm run build`        | Build your production site to `./dist/`          |
| `npm run preview`      | Preview your build locally, before deploying     |
| `npm run astro ...`    | Run CLI commands like `astro add`, `astro check` |
| `npm run astro --help` | Get help using the Astro CLI                     |

## ⚡️ Lighthouse
![lighthouse_astro_shopify](https://user-images.githubusercontent.com/10447155/214448698-ce2a1ef6-6fbd-4fca-b8b6-c5194b72a15b.jpg)
