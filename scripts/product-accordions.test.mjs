import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// PDP accordions ("Description"/"Fabric & Care"/"Shipping & COD"/
// "Returns & Help") — each shown only when its underlying data is present,
// accessible `<details>/<summary>`. Source-text-assertion style, matching
// this repo's convention for `.astro` component tests (no render harness).

test("ProductAccordions builds one entry per section, only when its data is present", async () => {
  const src = await read("src/components/ProductAccordions.astro");
  assert.match(src, /description \? \{ title: "Description", text: description \} : null/);
  assert.match(src, /fabricCare \? \{ title: "Fabric & Care", text: fabricCare \} : null/);
  assert.match(
    src,
    /shippingText \? \{ title: "Shipping & COD", text: shippingText \} : null/,
  );
  assert.match(
    src,
    /returnsText \|\| whatsappHref\s*\?\s*\{ title: "Returns & Help", text: returnsText, whatsappHref \}\s*:\s*null/,
  );
});

test("ProductAccordions never renders a section with no data at all", async () => {
  const src = await read("src/components/ProductAccordions.astro");
  assert.match(src, /\.filter\(\(accordion\): accordion is NonNullable<typeof accordion> =>/);
  assert.match(src, /accordions\.length > 0 &&/);
});

test("ProductAccordions uses <details>/<summary> for accessibility", async () => {
  const src = await read("src/components/ProductAccordions.astro");
  assert.match(src, /<details/);
  assert.match(src, /<summary/);
});

test("ProductAccordions validates whatsapp_number the same way WhatsappFloatButton does, never trusting the raw overlay value", async () => {
  const src = await read("src/components/ProductAccordions.astro");
  assert.match(src, /import \{ isValidWhatsappNumber, whatsappLink \} from "\.\.\/utils\/contact"/);
  assert.match(src, /isValidWhatsappNumber\(whatsappNumber\)/);
  assert.match(src, /whatsappLink\(whatsappNumber\)/);
});

test("ProductAccordions shows a WhatsApp link inside Returns & Help when whatsappHref is set", async () => {
  const src = await read("src/components/ProductAccordions.astro");
  assert.match(src, /accordion\.whatsappHref &&/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
});

test("the PDP passes product description, metadata.fabric_care, and the shipping/returns/whatsapp settings into ProductAccordions", async () => {
  const pdp = await read("src/pages/products/[...handle].astro");
  assert.match(pdp, /<ProductAccordions/);
  assert.match(pdp, /description=\{product\.description\}/);
  assert.match(pdp, /product\.metadata\?\.fabric_care/);
  assert.match(pdp, /shippingText=\{siteConfig\.shippingText\}/);
  assert.match(pdp, /returnsText=\{siteConfig\.returnsText\}/);
  assert.match(pdp, /whatsappNumber=\{siteConfig\.whatsappNumber\}/);
});

test("ProductInformations no longer renders the description itself (moved into the accordion)", async () => {
  const informations = await read("src/components/ProductInformations.astro");
  assert.doesNotMatch(informations, /description\??:\s*string/);
  assert.doesNotMatch(informations, /\{description\}/);
});
