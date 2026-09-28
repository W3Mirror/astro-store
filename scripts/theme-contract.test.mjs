import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Typed THEME settings (colors, radius, fonts, header logo height,
// announcement style) — set via the parent repo's `set_site_config`, never
// by editing this template. Mirrors `branding-contract.test.mjs`'s
// lightweight source-text-assertion style: no Astro render harness.

test("ThemeOverlayResult validates every color as a strict #RRGGBB hex", async () => {
  const schemas = await read("src/utils/schemas.ts");
  assert.match(schemas, /HEX_COLOR_RE = \/\^#\[0-9a-fA-F\]\{6\}\$\//);
  for (const field of [
    "accent",
    "accentContrast",
    "highlight",
    "canvas",
    "surface",
    "ink",
    "muted",
    "line",
  ]) {
    assert.match(
      schemas,
      new RegExp(`${field}: ThemeHexColor\\.nullable\\(\\)\\.optional\\(\\)`),
    );
  }
});

test("ThemeOverlayResult bounds theme_radius to 0-2rem / 0-32px", async () => {
  const schemas = await read("src/utils/schemas.ts");
  assert.match(schemas, /THEME_RADIUS_MAX_REM = 2/);
  assert.match(schemas, /THEME_RADIUS_MAX_PX = 32/);
  assert.match(schemas, /radius: ThemeRadiusValue\.nullable\(\)\.optional\(\)/);
});

test("ThemeOverlayResult only accepts the curated Google Fonts allowlist (plus 'system')", async () => {
  const schemas = await read("src/utils/schemas.ts");
  for (const font of [
    "system",
    "Inter",
    "Poppins",
    "Lato",
    "Playfair Display",
    "Lora",
    "Montserrat",
    "DM Sans",
    "EB Garamond",
    "Libre Baskerville",
    "Nunito",
    "Work Sans",
    "Merriweather",
    "Raleway",
    "Cormorant Garamond",
  ]) {
    assert.ok(
      schemas.includes(`"${font}"`),
      `expected schemas.ts to list font "${font}"`,
    );
  }
  assert.match(schemas, /headingFont: ThemeFontValue\.nullable\(\)\.optional\(\)/);
  assert.match(schemas, /bodyFont: ThemeFontValue\.nullable\(\)\.optional\(\)/);
});

test("ThemeOverlayResult validates header_logo_height and announcement_style as fixed enums", async () => {
  const schemas = await read("src/utils/schemas.ts");
  assert.match(
    schemas,
    /headerLogoHeight: z\.enum\(\["sm", "md", "lg"\]\)/,
  );
  assert.match(
    schemas,
    /announcementStyle: z\s*\.enum\(\["highlight", "accent", "subtle"\]\)/,
  );
});

test("SiteConfigOverlayResult carries the theme object", async () => {
  const schemas = await read("src/utils/schemas.ts");
  assert.match(schemas, /theme: ThemeOverlayResult\.nullable\(\)\.optional\(\)/);
});

test("getSiteConfig overlays theme onto env defaults (all null when unset)", async () => {
  const siteConfig = await read("src/utils/site-config.ts");
  assert.match(siteConfig, /theme: SiteThemeConfig;/);
  assert.match(siteConfig, /accent: overlay\.theme\?\.accent \?\? null/);
  assert.match(
    siteConfig,
    /announcementStyle: overlay\.theme\?\.announcementStyle \?\? null/,
  );
});

test("utils/theme.ts re-validates hex/radius/font a third time before CSS/URL interpolation", async () => {
  const theme = await read("src/utils/theme.ts");
  assert.match(theme, /HEX_COLOR_RE = \/\^#\[0-9a-fA-F\]\{6\}\$\//);
  assert.match(theme, /RADIUS_RE = \/\^\(\\d\+\(\?:\\\.\\d\+\)\?\)\(rem\|px\)\$\//);
  assert.match(theme, /export function safeHex/);
  assert.match(theme, /export function safeRadius/);
  assert.match(theme, /export function safeFont/);
  assert.match(theme, /THEME_FONTS as readonly string\[\]\)\.includes\(value\)/);
});

test("googleFontsHref only loads allowlisted fonts, never 'system', with display=swap", async () => {
  const theme = await read("src/utils/theme.ts");
  assert.match(theme, /f !== "system"/);
  assert.match(theme, /fonts\.googleapis\.com\/css2/);
  assert.match(theme, /display=swap/);
});

test("BaseLayout builds the :root override ONLY from re-validated theme values, and loads fonts with preconnect", async () => {
  const layout = await read("src/layouts/BaseLayout.astro");
  assert.match(layout, /themeStyleBlock\(siteConfig\.theme\)/);
  assert.match(layout, /googleFontsHref\(/);
  assert.match(layout, /rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/);
  assert.match(
    layout,
    /rel="preconnect"\s*\n\s*href="https:\/\/fonts\.gstatic\.com"/,
  );
  assert.match(layout, /\{themeStyle && <style set:html=\{themeStyle\} \/>\}/);
});

test("header_logo_height maps to a fixed, non-interpolated Tailwind class set (sm/md/lg), defaulting to today's md look", async () => {
  const header = await read("src/components/Header.astro");
  assert.match(header, /safeHeaderLogoHeight/);
  assert.match(header, /sm: "h-6 w-auto sm:h-8"/);
  assert.match(header, /md: "h-8 w-auto sm:h-10"/);
  assert.match(header, /lg: "h-10 w-auto sm:h-12"/);
});

test("announcement_style applies a fixed modifier class, defaulting to 'accent' (today's only look)", async () => {
  const bar = await read("src/components/AnnouncementBar.astro");
  assert.match(bar, /safeAnnouncementStyle/);
  assert.match(bar, /announcement-bar--\$\{safeAnnouncementStyle/);
  const css = await read("src/styles/global.css");
  assert.match(css, /\.announcement-bar,\s*\n\s*\.announcement-bar--accent/);
  assert.match(css, /\.announcement-bar--highlight/);
  assert.match(css, /\.announcement-bar--subtle/);
});

test("--store-highlight is defined with a default and wired into the cart badge, focus rings, and a footer divider", async () => {
  const css = await read("src/styles/global.css");
  assert.match(css, /--store-highlight: #064e3b;/);
  assert.match(css, /\.store-badge \{[^}]*var\(--store-highlight\)/s);
  assert.match(css, /focus:ring-\[var\(--store-highlight\)\]/);
  assert.match(css, /\.store-footer \{[^}]*var\(--store-highlight\)/s);
  const cartIcon = await read("src/components/CartIcon.svelte");
  assert.match(cartIcon, /store-badge/);
  assert.doesNotMatch(cartIcon, /bg-emerald-900/);
});

test("theme_heading_font/theme_body_font drive --store-font-heading/--store-font-body, falling back to today's default when unset", async () => {
  const css = await read("src/styles/global.css");
  assert.match(css, /font-family: var\(--store-font-body, inherit\);/);
  assert.match(css, /font-family: var\(--store-font-heading, inherit\);/);
});
