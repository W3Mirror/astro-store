import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Item 7: a sitewide floating WhatsApp click-to-chat button, rendered once
// by BaseLayout.astro, that lifts itself above the PDP's sticky "Add to
// bag" bar (item 4) via the shared `pdp:sticky-atc` window event instead of
// ever covering it on mobile.

test("BaseLayout renders the floating WhatsApp button on every page", async () => {
  const layout = await read("src/layouts/BaseLayout.astro");
  assert.match(layout, /import WhatsappFloatButton from "..\/components\/WhatsappFloatButton.astro"/);
  assert.match(layout, /<WhatsappFloatButton \/>/);
});

test("the button only renders when the store has a valid whatsapp_number, using the shared contact util", async () => {
  const whatsapp = await read("src/components/WhatsappFloatButton.astro");
  assert.match(whatsapp, /isValidWhatsappNumber\(siteConfig\.whatsappNumber\)/);
  assert.match(whatsapp, /whatsappLink\(siteConfig\.whatsappNumber\)/);
  assert.match(whatsapp, /target="_blank"/);
  assert.match(whatsapp, /rel="noopener noreferrer"/);
  assert.match(whatsapp, /aria-label=\{`Chat with \$\{siteConfig\.storeName\} on WhatsApp`\}/);
});

test("the button lifts itself above the PDP sticky add-to-bag bar via the pdp:sticky-atc event, never hardcoding a PDP dependency", async () => {
  const whatsapp = await read("src/components/WhatsappFloatButton.astro");
  assert.match(whatsapp, /addEventListener\("pdp:sticky-atc"/);
  assert.match(whatsapp, /whatsapp-float--raised/);
});

test("the button is styled globally (bottom-right, fixed) rather than with a component-scoped Svelte style block", async () => {
  const css = await read("src/styles/global.css");
  assert.match(css, /\.whatsapp-float \{/);
  assert.match(css, /position: fixed;/);
  assert.match(css, /\.whatsapp-float--raised \{/);
});
