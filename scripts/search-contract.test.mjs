import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Item 1: search is reachable from the header (desktop + mobile) and from
// the top of the mobile nav drawer, both submitting a plain GET to
// `/products?q=` and both reusing the shared `DialogController` (no bespoke
// open/close JS of their own).

test("a header search trigger opens an accessible search dialog", async () => {
  const header = await read("src/components/Header.astro");

  assert.match(header, /data-open-dialog="search-dialog"/);
  assert.match(header, /aria-controls="search-dialog"/);
  assert.match(header, /aria-haspopup="dialog"/);
  assert.match(header, /<dialog id="search-dialog"/);
  assert.match(header, /aria-label="Search products"/);
});

test("the search dialog submits a GET to /products with the q param", async () => {
  const header = await read("src/components/Header.astro");
  const searchDialogMatch = header.match(
    /<dialog id="search-dialog"[\s\S]*?<\/dialog>/,
  );
  assert.ok(searchDialogMatch, "expected a #search-dialog <dialog> block");
  const searchDialog = searchDialogMatch[0];

  assert.match(searchDialog, /<form method="get" action="\/products"/);
  assert.match(searchDialog, /name="q"/);
  assert.match(searchDialog, /type="search"/);
  assert.match(searchDialog, /data-close-dialog/);
});

test("the mobile nav drawer has a search input at the top of its body, ahead of the nav links", async () => {
  const header = await read("src/components/Header.astro");
  const drawerMatch = header.match(
    /<dialog id="nav-drawer"[\s\S]*?<\/dialog>/,
  );
  assert.ok(drawerMatch, "expected a #nav-drawer <dialog> block");
  const drawer = drawerMatch[0];

  assert.match(drawer, /<form method="get" action="\/products" class="nav-drawer__search">/);
  assert.match(drawer, /name="q"/);

  const searchIndex = drawer.indexOf('class="nav-drawer__search"');
  const firstLinkIndex = drawer.indexOf("nav-drawer__link");
  assert.ok(searchIndex >= 0 && firstLinkIndex >= 0);
  assert.ok(
    searchIndex < firstLinkIndex,
    "search input must render above the drawer's nav links",
  );
});

test("search reuses the shared DialogController instead of its own open/close script", async () => {
  const header = await read("src/components/Header.astro");
  const controller = await read("src/components/DialogController.astro");

  // Header.astro defines no <script> of its own for dialog wiring — every
  // open/close interaction rides on DialogController's generic
  // [data-open-dialog]/[data-close-dialog] contract (already included once,
  // globally, by BaseLayout.astro).
  assert.doesNotMatch(header, /<script>/);
  assert.match(controller, /data-open-dialog/);
  assert.match(controller, /data-close-dialog/);
});

test("/products already accepts a plain ?q= search query", async () => {
  const route = await read("src/pages/products/index.astro");
  const query = await read("src/utils/product-query.ts");

  assert.match(route, /parseProductQuery/);
  assert.match(query, /query: trimmedParam\(params\.get\("q"\)\)/);
});
