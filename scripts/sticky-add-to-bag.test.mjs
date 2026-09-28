import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Item 4: a sticky mobile "Add to bag" bar that appears once the primary
// add-to-cart button scrolls out of view, mirrors the selected variant's
// price, and is disabled/labelled per its sold-out/no-selection state.
// Item 7 (WhatsApp float button must not cover it) is verified against the
// same cross-island `pdp:sticky-atc` event contract.

test("the sticky bar appears via an IntersectionObserver on the primary add-to-cart button, mobile-only", async () => {
  const picker = await read("src/components/ProductVariantPicker.svelte");

  assert.match(picker, /bind:this=\{atcAnchorEl\}/);
  assert.match(picker, /new IntersectionObserver/);
  assert.match(picker, /stickyAtcVisible = !entry\.isIntersecting/);
  assert.match(picker, /class="pdp-sticky-atc md:hidden"/);
  assert.match(picker, /class:pdp-sticky-atc--visible=\{stickyAtcVisible\}/);
});

test("the sticky bar is non-interactive/hidden from assistive tech while not visible", async () => {
  const picker = await read("src/components/ProductVariantPicker.svelte");

  assert.match(picker, /inert=\{!stickyAtcVisible\}/);
  assert.match(picker, /aria-hidden=\{!stickyAtcVisible\}/);
});

test("the sticky bar shows the selected variant's price and disables/labels per sold-out or no-selection state", async () => {
  const picker = await read("src/components/ProductVariantPicker.svelte");
  const barMatch = picker.match(
    /class="pdp-sticky-atc md:hidden"[\s\S]*?<\/div>\s*\{#if stickyAddError\}/,
  );
  assert.ok(barMatch, "expected to find the sticky bar markup block");
  const bar = barMatch[0];

  assert.match(bar, /<Money price=\{price\}\s*\/>/);
  assert.match(
    bar,
    /disabled=\{\$isCartUpdating \|\| !selectedVariant \|\| !availability\.availableForSale\}/,
  );
  assert.match(bar, /Select options/);
  assert.match(bar, /Sold out/);
  assert.match(bar, /Add to bag/);
});

test("tapping the sticky bar adds the currently selected variant to the cart", async () => {
  const picker = await read("src/components/ProductVariantPicker.svelte");

  assert.match(picker, /addSelectedVariantToCart/);
  assert.match(picker, /await addCartItem\(\{ id: selectedVariant\.id, quantity: 1 \}\)/);
});

test("the sticky bar's visibility is broadcast for other islands (the floating WhatsApp button) to react to", async () => {
  const picker = await read("src/components/ProductVariantPicker.svelte");
  const whatsapp = await read("src/components/WhatsappFloatButton.astro");
  const layout = await read("src/layouts/BaseLayout.astro");

  assert.match(
    picker,
    /new CustomEvent\("pdp:sticky-atc", \{ detail: \{ visible: stickyAtcVisible \} \}\)/,
  );
  assert.match(whatsapp, /addEventListener\("pdp:sticky-atc"/);
  assert.match(whatsapp, /whatsapp-float--raised/);
  assert.match(layout, /<WhatsappFloatButton \/>/);
});

test("the product page passes the product's thumbnail and title through to the picker for the sticky bar", async () => {
  const page = await read("src/pages/products/[...handle].astro");

  assert.match(page, /productImageUrl=\{product\.thumbnail \|\| product\.images\[0\]\?\.url \|\| null\}/);
  assert.match(page, /productTitle=\{product\.title\}/);
});
