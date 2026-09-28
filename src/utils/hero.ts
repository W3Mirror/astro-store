// Homepage hero settings — layout, focal point, height, eyebrow, slides and
// autoplay — set per environment through the parent repo's
// `set_site_config` tool (`hero_layout`, `hero_focal`, `hero_height`,
// `hero_eyebrow`, `hero_slides`, `hero_autoplay_seconds`) and served by the
// public site-config endpoint. See the parent repo's
// `packages/backend-core/src/projects/storefront-schema.ts` for the write-
// side contract this mirrors.
//
// SECURITY: the backend validates every value before it is stored and again
// before it is served, but this module re-validates right before anything
// reaches the rendered HTML — a slide's `ctaHref` becomes an `<a href>`, so
// only a same-site path ("/...") or an https URL is ever accepted here; a
// `javascript:`/`data:`/protocol-relative value is dropped, never rendered.
// Every re-validation failure degrades to the default (hidden eyebrow, the
// boxed layout, the single static slide), never a crashed page.

export const HERO_LAYOUTS = ["boxed", "full_bleed_overlay"] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

export const HERO_FOCALS = ["left", "center", "right"] as const;
export type HeroFocal = (typeof HERO_FOCALS)[number];

export const HERO_HEIGHTS = ["sm", "md", "lg"] as const;
export type HeroHeight = (typeof HERO_HEIGHTS)[number];

export const HERO_EYEBROW_MAX_LENGTH = 60;
export const HERO_SLIDES_MAX = 6;
export const HERO_SLIDE_HEADING_MAX_LENGTH = 120;
export const HERO_SLIDE_SUBHEADING_MAX_LENGTH = 300;
export const HERO_SLIDE_IMAGE_ALT_MAX_LENGTH = 200;
export const HERO_SLIDE_CTA_LABEL_MAX_LENGTH = 40;
export const HERO_SLIDE_CTA_HREF_MAX_LENGTH = 500;
export const HERO_SLIDE_IMAGE_URL_MAX_LENGTH = 2048;
export const HERO_AUTOPLAY_DEFAULT_SECONDS = 6;
export const HERO_AUTOPLAY_MIN_SECONDS = 3;
export const HERO_AUTOPLAY_MAX_SECONDS = 15;

/** The CTA every hero rendered before this feature carried — kept for the single static (no `hero_slides`) slide. */
export const DEFAULT_HERO_CTA_LABEL = "Shop the collection";
export const DEFAULT_HERO_CTA_HREF = "#featured-products";

export interface HeroSlide {
  imageUrl: string | null;
  imageAlt: string;
  heading: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface HeroSettings {
  layout: HeroLayout;
  focal: HeroFocal;
  height: HeroHeight;
  eyebrow: string | null;
  slides: HeroSlide[];
  /** 0 disables autoplay. Always 0 when there's only one slide. */
  autoplaySeconds: number;
}

// Control characters and whitespace are never valid inside an href we'd
// render — browsers strip some of them while parsing a scheme, which is
// exactly how `java\tscript:` style payloads slip past naive checks.
const UNSAFE_HREF_CHARS_RE = /[\u0000- \u007f-\u009f\\]/;

/**
 * A slide CTA target: a same-site path ("/products", "/collections/x?y=1",
 * "#featured-products" is NOT accepted from settings — only the built-in
 * default uses a fragment) or an absolute https URL. Rejects `//host`
 * (protocol-relative, i.e. off-site), `javascript:`, `data:`, `http:`,
 * `mailto:` and anything with whitespace/control characters/backslashes.
 */
export function isSafeCtaHref(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > HERO_SLIDE_CTA_HREF_MAX_LENGTH) {
    return false;
  }
  if (UNSAFE_HREF_CHARS_RE.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Same https-only rule the backend applies to every branding image URL. */
export function isSafeHeroImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > HERO_SLIDE_IMAGE_URL_MAX_LENGTH) return false;
  if (UNSAFE_HREF_CHARS_RE.test(value)) return false;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function safeHeroLayout(value: unknown): HeroLayout {
  return pick(HERO_LAYOUTS, value, "boxed");
}

export function safeHeroFocal(value: unknown): HeroFocal {
  return pick(HERO_FOCALS, value, "center");
}

export function safeHeroHeight(value: unknown): HeroHeight {
  return pick(HERO_HEIGHTS, value, "md");
}

export function safeHeroEyebrow(value: unknown): string | null {
  return plainText(value, HERO_EYEBROW_MAX_LENGTH);
}

/** Integer 3-15, or 0 (autoplay off). Anything else → the 6s default. */
export function safeHeroAutoplaySeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return HERO_AUTOPLAY_DEFAULT_SECONDS;
  }
  if (value === 0) return 0;
  if (value < HERO_AUTOPLAY_MIN_SECONDS || value > HERO_AUTOPLAY_MAX_SECONDS) {
    return HERO_AUTOPLAY_DEFAULT_SECONDS;
  }
  return value;
}

/**
 * One configured slide, re-validated. Returns `null` (the slide is dropped)
 * when a required field — `imageUrl`, `heading` — is missing or unsafe. A
 * CTA renders only when BOTH its label and a safe href are present; an
 * unsafe href drops just the CTA, never the whole slide.
 */
export function sanitizeHeroSlide(value: unknown): HeroSlide | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isSafeHeroImageUrl(input.imageUrl)) return null;
  const heading = plainText(input.heading, HERO_SLIDE_HEADING_MAX_LENGTH);
  if (!heading) return null;
  const imageAlt =
    plainText(input.imageAlt, HERO_SLIDE_IMAGE_ALT_MAX_LENGTH) ?? heading;
  const subheading = plainText(
    input.subheading,
    HERO_SLIDE_SUBHEADING_MAX_LENGTH,
  );
  const ctaLabel = plainText(input.ctaLabel, HERO_SLIDE_CTA_LABEL_MAX_LENGTH);
  const ctaHref = isSafeCtaHref(input.ctaHref) ? input.ctaHref : null;
  const hasCta = Boolean(ctaLabel && ctaHref);
  return {
    imageUrl: input.imageUrl,
    imageAlt,
    heading,
    subheading,
    ctaLabel: hasCta ? ctaLabel : null,
    ctaHref: hasCta ? ctaHref : null,
  };
}

/** Every valid slide, in order, capped at `HERO_SLIDES_MAX`. Never throws. */
export function sanitizeHeroSlides(value: unknown): HeroSlide[] {
  if (!Array.isArray(value)) return [];
  const slides: HeroSlide[] = [];
  for (const entry of value) {
    const slide = sanitizeHeroSlide(entry);
    if (slide) slides.push(slide);
    if (slides.length >= HERO_SLIDES_MAX) break;
  }
  return slides;
}

export interface HeroSettingsInput {
  heroLayout?: unknown;
  heroFocal?: unknown;
  heroHeight?: unknown;
  heroEyebrow?: unknown;
  heroSlides?: unknown;
  heroAutoplaySeconds?: unknown;
  heroHeading?: string | null;
  heroSubheading?: string | null;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
}

/**
 * The effective hero for the homepage. With no valid `heroSlides`, the
 * store's existing single hero (`heroImageUrl`/`heroHeading`/
 * `heroSubheading`) is the one static slide — exactly what every store
 * rendered before slides existed — falling back to `fallbackHeading`/
 * `fallbackSubheading` for the copy.
 */
export function resolveHeroSettings(
  input: HeroSettingsInput,
  fallback: { heading: string; subheading: string },
): HeroSettings {
  const configured = sanitizeHeroSlides(input.heroSlides);
  const slides: HeroSlide[] =
    configured.length > 0
      ? configured
      : [
          {
            imageUrl: isSafeHeroImageUrl(input.heroImageUrl)
              ? input.heroImageUrl
              : null,
            heading: input.heroHeading || fallback.heading,
            imageAlt:
              input.heroImageAlt || input.heroHeading || fallback.heading,
            subheading: input.heroSubheading || fallback.subheading,
            ctaLabel: DEFAULT_HERO_CTA_LABEL,
            ctaHref: DEFAULT_HERO_CTA_HREF,
          },
        ];
  return {
    layout: safeHeroLayout(input.heroLayout),
    focal: safeHeroFocal(input.heroFocal),
    height: safeHeroHeight(input.heroHeight),
    eyebrow: safeHeroEyebrow(input.heroEyebrow),
    slides,
    autoplaySeconds:
      slides.length > 1 ? safeHeroAutoplaySeconds(input.heroAutoplaySeconds) : 0,
  };
}

/** `N of M` — the accessible name of each carousel slide. */
export function slideLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}
