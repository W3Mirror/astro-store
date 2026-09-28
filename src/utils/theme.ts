// Typed THEME settings — Shopify-style storefront customisation set via the
// parent repo's `set_site_config` tool, never by editing this template's
// code. See the parent repo's `docs-internal/store-lifecycle.mdx` and
// `packages/backend-core/src/projects/theme-schema.ts` for the full
// contract this mirrors.
//
// SECURITY: every value here has ALREADY been validated once by
// `SiteConfigOverlayResult` in `schemas.ts` (which itself mirrors the
// backend's validation), but this module re-validates a THIRD time, right
// at the point every value is interpolated into an inline `<style>` block
// or a Google Fonts `<link>` URL in `BaseLayout.astro` — the single most
// security-sensitive place in this template. Never trust a value this far
// downstream without checking it again: defense in depth against a bug in
// an earlier layer, not distrust of this template's own callers.

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const RADIUS_RE = /^(\d+(?:\.\d+)?)(rem|px)$/;
const RADIUS_MAX_REM = 2;
const RADIUS_MAX_PX = 32;

export const THEME_FONTS = [
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
] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

export const HEADER_LOGO_HEIGHTS = ["sm", "md", "lg"] as const;
export type HeaderLogoHeight = (typeof HEADER_LOGO_HEIGHTS)[number];

export const ANNOUNCEMENT_STYLES = ["highlight", "accent", "subtle"] as const;
export type AnnouncementStyle = (typeof ANNOUNCEMENT_STYLES)[number];

/** The site-config overlay's `theme` shape, as consumed by `getSiteConfig()` — see `utils/site-config.ts`. */
export interface SiteThemeConfig {
  accent: string | null;
  accentContrast: string | null;
  highlight: string | null;
  canvas: string | null;
  surface: string | null;
  ink: string | null;
  muted: string | null;
  line: string | null;
  radius: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  headerLogoHeight: string | null;
  announcementStyle: string | null;
}

export function safeHex(value: string | null | undefined): string | null {
  return typeof value === "string" && HEX_COLOR_RE.test(value) ? value : null;
}

export function safeRadius(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = RADIUS_RE.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount < 0) return null;
  const withinBounds =
    unit === "rem" ? amount <= RADIUS_MAX_REM : amount <= RADIUS_MAX_PX;
  return withinBounds ? value.trim() : null;
}

export function safeFont(value: string | null | undefined): ThemeFont | null {
  return typeof value === "string" &&
    (THEME_FONTS as readonly string[]).includes(value)
    ? (value as ThemeFont)
    : null;
}

function safeEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function safeHeaderLogoHeight(
  value: string | null | undefined,
): HeaderLogoHeight {
  return safeEnum(value, HEADER_LOGO_HEIGHTS) ?? "md";
}

export function safeAnnouncementStyle(
  value: string | null | undefined,
): AnnouncementStyle {
  return safeEnum(value, ANNOUNCEMENT_STYLES) ?? "accent";
}

const HEX_FIELD_TO_CSS_VAR: Record<string, string> = {
  accent: "--store-accent",
  accentContrast: "--store-accent-contrast",
  highlight: "--store-highlight",
  canvas: "--store-canvas",
  surface: "--store-surface",
  ink: "--store-ink",
  muted: "--store-muted",
  line: "--store-line",
};

/**
 * Builds the `:root` CSS custom-property overrides for an inline `<style>`
 * block — ONLY from values that re-validate here. An absent/invalid key is
 * simply omitted, which means "fall through to `global.css`'s hardcoded
 * `:root` default", exactly matching "keep the defaults exactly as today
 * when no theme is set."
 */
export function buildThemeStyleVars(
  theme: SiteThemeConfig,
): Record<string, string> {
  const vars: Record<string, string> = {};
  const themeRecord = theme as unknown as Record<string, string | null>;
  for (const [field, cssVar] of Object.entries(HEX_FIELD_TO_CSS_VAR)) {
    const value = safeHex(themeRecord[field]);
    if (value) vars[cssVar] = value;
  }
  const radius = safeRadius(theme.radius);
  if (radius) vars["--store-radius"] = radius;
  const headingFont = safeFont(theme.headingFont);
  if (headingFont && headingFont !== "system") {
    vars["--store-font-heading"] = `'${headingFont}', serif`;
  }
  const bodyFont = safeFont(theme.bodyFont);
  if (bodyFont && bodyFont !== "system") {
    vars["--store-font-body"] = `'${bodyFont}', sans-serif`;
  }
  return vars;
}

/** Serializes `buildThemeStyleVars`' output as `:root{...}` CSS text, or `""` when there is nothing to override. */
export function themeStyleBlock(theme: SiteThemeConfig): string {
  const vars = buildThemeStyleVars(theme);
  const entries = Object.entries(vars);
  if (entries.length === 0) return "";
  const declarations = entries.map(([k, v]) => `${k}:${v};`).join("");
  return `:root{${declarations}}`;
}

/**
 * A `fonts.googleapis.com/css2` stylesheet URL loading ONLY the given
 * allowlisted fonts (never `"system"`, which needs no web font), with
 * `display=swap` and a small, fixed weight set. Re-validates every font
 * against `THEME_FONTS` before it is ever interpolated into the URL —
 * `encodeURIComponent` alone is not the security boundary here, allowlist
 * membership is. Returns `null` when there is nothing to load.
 */
export function googleFontsHref(fonts: (string | null)[]): string | null {
  const families = Array.from(
    new Set(
      fonts
        .map((f) => safeFont(f))
        .filter((f): f is ThemeFont => Boolean(f) && f !== "system"),
    ),
  );
  if (families.length === 0) return null;
  const params = families
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
