import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import svelte from "@astrojs/svelte";
import { getViteConfig } from "astro/config";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createServer } from "vite";

// Settings-driven homepage hero: `hero_layout`, `hero_focal`, `hero_height`,
// `hero_eyebrow`, `hero_slides`, `hero_autoplay_seconds`. Covers the
// settings parsing/re-validation (`utils/hero.ts`, `schemas.ts`), real
// renders of both layouts and the carousel markup (Astro container API),
// and the autoplay/reduced-motion rotation controller
// (`utils/hero-carousel.ts`).

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const viteConfig = await getViteConfig(
  {
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false },
  },
  { root, configFile: false, integrations: [svelte()], logLevel: "error" },
)({ command: "serve", mode: "test" });
const server = await createServer(viteConfig);

const hero = await server.ssrLoadModule(`${root}src/utils/hero.ts`);
const carousel = await server.ssrLoadModule(
  `${root}src/utils/hero-carousel.ts`,
);
const schemas = await server.ssrLoadModule(`${root}src/utils/schemas.ts`);
const HeroComponent = (
  await server.ssrLoadModule(`${root}src/components/Hero.astro`)
).default;
const svelteServer = (
  await server.ssrLoadModule("@astrojs/svelte/server.js")
).default;
const container = await AstroContainer.create();
container.addServerRenderer({ name: "@astrojs/svelte", renderer: svelteServer });

test.after(async () => {
  await server.close();
});

const render = async (props) =>
  (await container.renderToString(HeroComponent, { props })).replace(
    / data-astro-source-[a-z]+="[^"]*"/g,
    "",
  );

const BLOB =
  "https://files.blob.w3dev.app/ssk3s7r8u92p88ij/stores/e2FhOEi1a5_nreuAhUpUL/live/products";
const slide = (overrides = {}) => ({
  imageUrl: `${BLOB}/0a121002a83a4f95b243-nagama-hero-slide-1-main.jpg`,
  imageAlt: "Suits on linen",
  heading: "Quality You Can Feel",
  ctaLabel: "Shop all",
  ctaHref: "/products",
  ...overrides,
});
const threeSlides = [
  slide(),
  slide({
    imageUrl: `${BLOB}/1e540f49e39c4fd7a69a-nagama-hero-slide-2-bridal.jpg`,
    heading: "Bridal & Festive",
    ctaHref: "/collections/bridal-festive",
  }),
  slide({
    imageUrl: `${BLOB}/d59edb115e6041af922a-nagama-hero-slide-3-organza.jpg`,
    heading: "Organza & Handwork",
    ctaHref: "/collections/organza-suits",
  }),
];

// --- settings parsing / validation -----------------------------------------

test("isSafeCtaHref accepts same-site paths and https URLs only", () => {
  for (const ok of [
    "/products",
    "/collections/bridal-festive",
    "/products?q=silk#top",
    "https://example.com/sale",
  ]) {
    assert.equal(hero.isSafeCtaHref(ok), true, ok);
  }
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://example.com",
    "//evil.example/path",
    "/\\evil.example",
    "mailto:a@b.c",
    "products",
    "#featured-products",
    "",
    "/" + "a".repeat(600),
    null,
    42,
  ]) {
    assert.equal(hero.isSafeCtaHref(bad), false, String(bad));
  }
});

test("sanitizeHeroSlide drops an unsafe cta_href but keeps the slide", () => {
  const result = hero.sanitizeHeroSlide(
    slide({ ctaHref: "javascript:alert(document.cookie)" }),
  );
  assert.ok(result);
  assert.equal(result.heading, "Quality You Can Feel");
  assert.equal(result.ctaHref, null);
  assert.equal(result.ctaLabel, null);
});

test("sanitizeHeroSlide rejects slides without a safe image or heading", () => {
  assert.equal(hero.sanitizeHeroSlide(slide({ imageUrl: "http://x.test/a.jpg" })), null);
  assert.equal(hero.sanitizeHeroSlide(slide({ imageUrl: "javascript:alert(1)" })), null);
  assert.equal(hero.sanitizeHeroSlide(slide({ heading: "" })), null);
  assert.equal(hero.sanitizeHeroSlide(slide({ heading: "x".repeat(121) })), null);
  assert.equal(hero.sanitizeHeroSlide("not a slide"), null);
  assert.equal(hero.sanitizeHeroSlide([slide()]), null);
});

test("sanitizeHeroSlide falls back to the heading for a missing alt and drops over-long optional text", () => {
  const result = hero.sanitizeHeroSlide(
    slide({ imageAlt: undefined, subheading: "s".repeat(301) }),
  );
  assert.equal(result.imageAlt, "Quality You Can Feel");
  assert.equal(result.subheading, null);
});

test("sanitizeHeroSlides keeps valid slides in order and caps at 6", () => {
  const many = Array.from({ length: 9 }, (_, i) => slide({ heading: `S${i}` }));
  const result = hero.sanitizeHeroSlides([{ bad: true }, ...many]);
  assert.equal(result.length, 6);
  assert.deepEqual(
    result.map((s) => s.heading),
    ["S0", "S1", "S2", "S3", "S4", "S5"],
  );
  assert.deepEqual(hero.sanitizeHeroSlides("[]"), []);
  assert.deepEqual(hero.sanitizeHeroSlides(null), []);
});

test("layout/focal/height/eyebrow/autoplay fall back to their defaults", () => {
  assert.equal(hero.safeHeroLayout("full_bleed_overlay"), "full_bleed_overlay");
  assert.equal(hero.safeHeroLayout("carousel"), "boxed");
  assert.equal(hero.safeHeroLayout(null), "boxed");
  assert.equal(hero.safeHeroFocal("right"), "right");
  assert.equal(hero.safeHeroFocal("top"), "center");
  assert.equal(hero.safeHeroHeight("lg"), "lg");
  assert.equal(hero.safeHeroHeight("xl"), "md");
  assert.equal(hero.safeHeroEyebrow("New season"), "New season");
  assert.equal(hero.safeHeroEyebrow("   "), null);
  assert.equal(hero.safeHeroEyebrow("x".repeat(61)), null);
  assert.equal(hero.safeHeroAutoplaySeconds(0), 0);
  assert.equal(hero.safeHeroAutoplaySeconds(3), 3);
  assert.equal(hero.safeHeroAutoplaySeconds(15), 15);
  assert.equal(hero.safeHeroAutoplaySeconds(2), 6);
  assert.equal(hero.safeHeroAutoplaySeconds(16), 6);
  assert.equal(hero.safeHeroAutoplaySeconds(4.5), 6);
  assert.equal(hero.safeHeroAutoplaySeconds(null), 6);
});

test("resolveHeroSettings: no slides → the existing hero image/copy as one static slide", () => {
  const settings = hero.resolveHeroSettings(
    {
      heroHeading: "Quality You Can Feel",
      heroSubheading: "Handwork suits",
      heroImageUrl: `${BLOB}/hero.jpg`,
      heroImageAlt: "Folded suits",
    },
    { heading: "Default", subheading: "Default sub" },
  );
  assert.equal(settings.layout, "boxed");
  assert.equal(settings.eyebrow, null);
  assert.equal(settings.autoplaySeconds, 0);
  assert.deepEqual(settings.slides, [
    {
      imageUrl: `${BLOB}/hero.jpg`,
      heading: "Quality You Can Feel",
      imageAlt: "Folded suits",
      subheading: "Handwork suits",
      ctaLabel: "Shop the collection",
      ctaHref: "#featured-products",
    },
  ]);
});

test("resolveHeroSettings: configured slides replace the single hero", () => {
  const settings = hero.resolveHeroSettings(
    { heroSlides: threeSlides, heroHeading: "Ignored", heroAutoplaySeconds: 8 },
    { heading: "Default", subheading: "" },
  );
  assert.equal(settings.slides.length, 3);
  assert.equal(settings.slides[1].heading, "Bridal & Festive");
  assert.equal(settings.autoplaySeconds, 8);
});

test("SiteConfigOverlayResult parses hero settings and never fails the whole overlay on a bad hero value", () => {
  const base = {
    storeName: "Nagama Fashion",
    heroHeading: "Quality You Can Feel",
    theme: { accent: "#6C050D", headerLogoHeight: "lg" },
    showTestBanner: false,
    seo: null,
  };
  const good = schemas.SiteConfigOverlayResult.parse({
    ...base,
    heroLayout: "full_bleed_overlay",
    heroFocal: "right",
    heroHeight: "md",
    heroEyebrow: null,
    heroSlides: threeSlides,
    heroAutoplaySeconds: 6,
  });
  assert.equal(good.heroLayout, "full_bleed_overlay");
  assert.equal(good.heroSlides.length, 3);
  assert.equal(good.heroAutoplaySeconds, 6);

  const bad = schemas.SiteConfigOverlayResult.parse({
    ...base,
    heroLayout: 7,
    heroSlides: "not-an-array",
    heroAutoplaySeconds: "six",
    heroEyebrow: { x: 1 },
  });
  assert.equal(bad.storeName, "Nagama Fashion");
  assert.equal(bad.theme.accent, "#6C050D");
  assert.equal(bad.heroLayout, null);
  assert.equal(bad.heroSlides, null);
  assert.equal(bad.heroAutoplaySeconds, null);
  assert.equal(bad.heroEyebrow, null);

  // An endpoint that predates these keys still parses.
  const legacy = schemas.SiteConfigOverlayResult.parse(base);
  assert.equal(legacy.heroSlides, undefined);
});

test("getSiteConfig overlays the hero settings onto env defaults", async () => {
  const siteConfig = await read("src/utils/site-config.ts");
  for (const field of [
    "heroLayout",
    "heroFocal",
    "heroHeight",
    "heroEyebrow",
    "heroSlides",
    "heroAutoplaySeconds",
  ]) {
    assert.match(siteConfig, new RegExp(`${field}: null,`));
    assert.match(siteConfig, new RegExp(`${field}:\\s*\\n?\\s*overlay\\.${field}`));
  }
  const home = await read("src/pages/index.astro");
  assert.match(home, /slides=\{siteConfig\.heroSlides\}/);
  assert.match(home, /layout=\{siteConfig\.heroLayout\}/);
});

// --- rendering: boxed ------------------------------------------------------

test("boxed (default): today's hero, with no hard-coded eyebrow", async () => {
  const html = await render({
    heading: "Quality You Can Feel",
    subheading: "Handwork suits",
    imageUrl: `${BLOB}/hero.jpg`,
    imageAlt: "Folded suits",
  });
  assert.doesNotMatch(html, /new collection/i);
  assert.doesNotMatch(html, /store-hero__eyebrow/);
  assert.match(html, /<section class="store-hero border-b">/);
  assert.match(html, /store-hero__inner container py-16 sm:py-24/);
  assert.match(html, /store-hero__image mb-8 overflow-hidden rounded-lg/);
  assert.match(html, /alt="Folded suits" loading="eager" fetchpriority="high"/);
  assert.match(html, /<h1 class="store-hero__heading[^"]*">Quality You Can Feel<\/h1>/);
  assert.match(html, /href="#featured-products">Shop the collection<\/a>/);
  assert.doesNotMatch(html, /aria-roledescription/);
  assert.doesNotMatch(html, /srcset/);
});

test("boxed: the eyebrow renders only from hero_eyebrow", async () => {
  const html = await render({ heading: "H", eyebrow: "Festive edit" });
  assert.match(html, /<p class="store-hero__eyebrow">Festive edit<\/p>/);
});

// --- rendering: full_bleed_overlay -----------------------------------------

test("full_bleed_overlay: single slide, cover image with focal/height classes, no carousel chrome", async () => {
  const html = await render({
    heading: "Quality You Can Feel",
    subheading: "Handwork suits",
    imageUrl: `${BLOB}/hero.jpg`,
    layout: "full_bleed_overlay",
    focal: "right",
    height: "lg",
  });
  assert.match(
    html,
    /class="store-hero-deck store-hero-deck--full_bleed_overlay store-hero-deck--focal-right store-hero-deck--h-lg"/,
  );
  assert.doesNotMatch(html, /store-hero-deck[^"]*border-b/);
  assert.doesNotMatch(html, /aria-roledescription/);
  assert.doesNotMatch(html, /data-hero-carousel/);
  assert.doesNotMatch(html, /store-hero-deck__nav/);
  assert.match(html, /<h1 class="store-hero-deck__heading">Quality You Can Feel<\/h1>/);
  assert.match(html, /store-hero-deck__inner container/);
  assert.match(html, /loading="eager" fetchpriority="high"/);
  assert.match(html, /class="store-hero__action store-hero-deck__action" href="#featured-products"/);
});

test("full_bleed_overlay CSS: edge-to-edge cover, flush, theme-only colors, mobile scrim ≥ 60%", async () => {
  const css = await read("src/styles/global.css");
  assert.match(css, /object-fit: cover;\s*object-position: var\(--store-hero-deck-focal\);/);
  assert.match(css, /--store-hero-deck-ink: var\(--store-accent-contrast\);/);
  assert.match(css, /--store-hero-deck-scrim: var\(--store-ink\);/);
  // Heights: ~45/60/75vh desktop, clamped 360-720px; ~55-65vh on mobile.
  assert.match(css, /clamp\(360px, 45vh, 720px\)/);
  assert.match(css, /clamp\(360px, 60vh, 720px\)/);
  assert.match(css, /clamp\(360px, 75vh, 720px\)/);
  assert.match(css, /clamp\(360px, 55vh, 720px\)/);
  assert.match(css, /clamp\(360px, 65vh, 720px\)/);
  const mobile = css.slice(css.indexOf("Mobile: copy bottom-left"));
  const bottomStop = /0deg,\s*color-mix\(in srgb, var\(--store-hero-deck-scrim\) (\d+)%/.exec(mobile);
  assert.ok(bottomStop, "mobile gradient present");
  assert.ok(Number(bottomStop[1]) >= 60, "bottom of the mobile scrim is at least 60% opaque");
  const deck = css.slice(css.indexOf(".store-hero-deck {"), css.indexOf(".products-section__heading {"));
  assert.doesNotMatch(deck, /#[0-9a-fA-F]{3,6}\b/, "theme variables only");
  assert.doesNotMatch(
    css.slice(css.indexOf("Full-bleed overlay:"), css.indexOf("Carousel navigation")),
    /border-radius/,
    "square corners",
  );
});

// --- rendering: carousel ---------------------------------------------------

test("carousel: accessible region, N-of-M slides, image loading priorities, pause control", async () => {
  const html = await render({
    heading: "Fallback",
    layout: "full_bleed_overlay",
    slides: threeSlides,
    autoplaySeconds: 6,
  });
  assert.match(html, /aria-roledescription="carousel" aria-label="Featured" data-hero-carousel data-autoplay-seconds="6"/);
  for (const [i, label] of ["1 of 3", "2 of 3", "3 of 3"].entries()) {
    assert.match(
      html,
      new RegExp(`role="group" aria-roledescription="slide" aria-label="${label}"`),
    );
    assert.match(html, new RegExp(`aria-label="Show slide ${label}"`));
    void i;
  }
  // Only the first slide is exposed before JS runs.
  assert.equal((html.match(/aria-hidden="true" inert/g) ?? []).length, 2);
  assert.equal((html.match(/data-active/g) ?? []).length, 1);
  // First image eager + high priority, the rest lazy. No srcset (the blob
  // host has no resizing, so there are no widths to offer).
  assert.equal((html.match(/loading="eager" fetchpriority="high"/g) ?? []).length, 1);
  assert.equal((html.match(/loading="lazy"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /srcset/);
  assert.match(html, /sizes="100vw"/);
  // One h1; later slides use h2.
  assert.equal((html.match(/<h1 /g) ?? []).length, 1);
  assert.equal((html.match(/<h2 /g) ?? []).length, 2);
  // Controls: pause/play (WCAG 2.2.2), prev/next, dots — hidden until JS.
  assert.match(html, /class="store-hero-deck__nav" data-hero-js hidden/);
  assert.match(html, /data-hero-rotation data-state="playing" aria-controls="store-hero-slides" aria-label="Pause slideshow"/);
  assert.match(html, /data-hero-prev aria-controls="store-hero-slides" aria-label="Previous slide"/);
  assert.match(html, /data-hero-next aria-controls="store-hero-slides" aria-label="Next slide"/);
  assert.match(html, /id="store-hero-slides" data-hero-live aria-live="off"/);
  assert.match(html, /href="\/collections\/organza-suits">Shop all<\/a>/);
});

test("carousel: autoplay 0 → no rotation control and a polite live region", async () => {
  const html = await render({ heading: "H", slides: threeSlides, autoplaySeconds: 0 });
  assert.match(html, /store-hero-deck--boxed/);
  assert.match(html, /data-autoplay-seconds="0"/);
  assert.doesNotMatch(html, /data-hero-rotation/);
  assert.match(html, /aria-live="polite"/);
});

test("carousel: an unsafe cta_href is never rendered", async () => {
  const html = await render({
    heading: "H",
    layout: "full_bleed_overlay",
    slides: [
      slide({ ctaHref: "javascript:alert(1)", ctaLabel: "Bad" }),
      slide({ heading: "Two", ctaHref: "//evil.example", ctaLabel: "Worse" }),
    ],
  });
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /evil\.example/);
  assert.doesNotMatch(html, />Bad</);
  assert.equal((html.match(/aria-roledescription="slide"/g) ?? []).length, 2);
});

test("carousel CSS: visible focus style, arrows desktop-only, no transitions under reduced motion", async () => {
  const css = await read("src/styles/global.css");
  assert.match(css, /\.store-hero-deck button:focus-visible,\s*\.store-hero-deck a:focus-visible \{\s*outline: 3px solid/);
  assert.match(css, /@media \(width < 48rem\)[\s\S]*\.store-hero-deck__arrow \{\s*display: none;/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.store-hero-deck__slide,\s*\.store-hero-deck__slide\[data-active\] \{\s*transition: none;/,
  );
});

// --- rotation controller (autoplay, pause, reduced motion) -----------------

const fakeScheduler = () => {
  const timers = new Map();
  let nextId = 1;
  return {
    timers,
    set(callback, ms) {
      const id = nextId++;
      timers.set(id, { callback, ms });
      return id;
    },
    clear(id) {
      timers.delete(id);
    },
    fire() {
      const [id, timer] = [...timers.entries()][0];
      timers.delete(id);
      timer.callback();
    },
  };
};

test("rotation: autoplays every N seconds and wraps around", () => {
  const scheduler = fakeScheduler();
  const rotation = carousel.createHeroRotation({
    total: 3,
    autoplaySeconds: 6,
    reducedMotion: false,
    scheduler,
  });
  rotation.setPageVisible(true);
  assert.equal(scheduler.timers.size, 1);
  assert.equal([...scheduler.timers.values()][0].ms, 6000);
  scheduler.fire();
  scheduler.fire();
  assert.equal(rotation.state.index, 2);
  scheduler.fire();
  assert.equal(rotation.state.index, 0);
  assert.equal(rotation.state.rotating, true);
});

test("rotation: NO autoplay under prefers-reduced-motion until the shopper presses play", () => {
  const scheduler = fakeScheduler();
  const rotation = carousel.createHeroRotation({
    total: 3,
    autoplaySeconds: 6,
    reducedMotion: true,
    scheduler,
  });
  rotation.setPageVisible(true);
  assert.equal(scheduler.timers.size, 0);
  assert.equal(rotation.state.userPaused, true);
  assert.equal(rotation.state.rotating, false);
  rotation.next();
  assert.equal(rotation.state.index, 1);
  assert.equal(scheduler.timers.size, 0);
  rotation.toggleRotation();
  assert.equal(scheduler.timers.size, 1);
});

test("rotation: switching to reduced motion mid-rotation stops it", () => {
  const scheduler = fakeScheduler();
  const rotation = carousel.createHeroRotation({
    total: 2,
    autoplaySeconds: 5,
    reducedMotion: false,
    scheduler,
  });
  rotation.setPageVisible(true);
  assert.equal(scheduler.timers.size, 1);
  rotation.setReducedMotion(true);
  assert.equal(scheduler.timers.size, 0);
  assert.equal(rotation.state.userPaused, true);
});

test("rotation: pauses on hover and hidden tab, stops on focus until play", () => {
  const scheduler = fakeScheduler();
  const rotation = carousel.createHeroRotation({
    total: 3,
    autoplaySeconds: 6,
    reducedMotion: false,
    scheduler,
  });
  rotation.setPageVisible(true);
  rotation.setHovered(true);
  assert.equal(scheduler.timers.size, 0);
  rotation.setHovered(false);
  assert.equal(scheduler.timers.size, 1);
  rotation.setPageVisible(false);
  assert.equal(scheduler.timers.size, 0);
  rotation.setPageVisible(true);
  assert.equal(scheduler.timers.size, 1);
  rotation.focusEntered();
  assert.equal(scheduler.timers.size, 0);
  rotation.focusLeft();
  assert.equal(scheduler.timers.size, 0, "focus leaving never resumes on its own");
  rotation.toggleRotation();
  assert.equal(rotation.state.userPaused, false);
  assert.equal(scheduler.timers.size, 1);
  rotation.toggleRotation();
  assert.equal(scheduler.timers.size, 0);
});

test("rotation: autoplay 0 or a single slide never schedules", () => {
  for (const [total, seconds] of [
    [3, 0],
    [1, 6],
  ]) {
    const scheduler = fakeScheduler();
    const rotation = carousel.createHeroRotation({
      total,
      autoplaySeconds: seconds,
      reducedMotion: false,
      scheduler,
    });
    rotation.setPageVisible(true);
    rotation.toggleRotation();
    assert.equal(scheduler.timers.size, 0);
    assert.equal(rotation.state.canAutoplay, false);
  }
});

test("carousel script wires keyboard arrows, swipe, visibility and reduced motion", async () => {
  const source = await read("src/utils/hero-carousel.ts");
  assert.match(source, /REDUCED_MOTION_QUERY = "\(prefers-reduced-motion: reduce\)"/);
  assert.match(source, /event\.key === "ArrowLeft"/);
  assert.match(source, /event\.key === "ArrowRight"/);
  assert.match(source, /"touchstart"/);
  assert.match(source, /"touchend"/);
  assert.match(source, /"visibilitychange"/);
  assert.match(source, /"mouseenter"/);
  assert.match(source, /"focusin"/);
  const component = await read("src/components/Hero.astro");
  assert.match(component, /initHeroCarousel\(root, window\)/);
});

test("layout: no reserved scrollbar gutter (full-bleed bars reach both edges)", async () => {
  // `scrollbar-gutter: stable both-edges` left an empty strip on the LEFT
  // edge with classic scrollbars, where full-bleed bars (announcement,
  // header) visibly stopped short of the window edge.
  const css = await read("src/styles/global.css");
  assert.doesNotMatch(css, /scrollbar-gutter/);
});
