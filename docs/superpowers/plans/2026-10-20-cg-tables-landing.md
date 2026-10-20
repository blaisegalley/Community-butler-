# CG Tables Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a one-file, viewport-locked CG Tables landing page (ATRIUM MTL layout, mahjong palette) whose Reserve buttons create $0 Wix Stores orders through Wix's hosted checkout, hosted on a new Wix Headless site.

**Architecture:** A new Wix Headless site (provisioned with `origin: "drop"`) holds the Stores catalog: three $0 products with generated images. `cg-tables/index.html` is static. It mints an anonymous visitor token with the site's public OAuth `appId`, reads the three products from the catalog, and on Reserve builds a cart → checkout → redirect session over plain `fetch`, then navigates to Wix's checkout. The page and fonts are dropped onto the same site's `*.wix-site-host.com` hosting.

**Tech Stack:** HTML/CSS/vanilla JS (no libraries), Wix REST (Headless provision, Stores Catalog V3, eCom cart/checkout, Redirects), Higgsfield image generation, Playwright 1.56 (global, `/opt/pw-browsers/chromium`) for checks.

**Spec:** `docs/superpowers/specs/2026-10-20-cg-tables-landing-design.md`. The ATRIUM MTL prompt in the conversation is the structural source of truth; the spec lists only the deltas from it.

## Global Constraints

- One `cg-tables/index.html`: inline `<style>`, inline SVG, vanilla JS. No external CSS/JS, no `<video>`, no build step.
- Fonts: `@font-face` Archivo (wght 100–900, wdth 62%–125%) → `assets/fonts/archivo.woff2`; Inter (wght 100–900) → `assets/fonts/inter.woff2`; `font-display: block`.
- Keep the prompt's `--grain` URL verbatim: `https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/40b7fef3-410d-4ef3-bd67-0a2fc7ee5a1d.svg`.
- `--img-sculpt|man|visit|sil` point at Wix Media URLs of the generated images (not CloudFront).
- Palette: `--paper #f3efe4`, `--ink #0f0f0e`, `--red #c8322b`, `--yellow #e9c46a`, `--blue #3f8f6b` (renders jade; class names unchanged), `--card-cream #f9f6f1`, `--card-dark #151515`.
- All other tokens, grid geometry, 14.6s marquee, responsive mode media queries, `fit()` math, menu behaviour, WAAPI entrance and a11y: exactly as in the ATRIUM prompt.
- Contact: `tel:+17733016638` shown as "Call : (773)" / "301-6638"; `mailto:cfgalley@yahoo.com` shown as "Email : cfgalley" / "@yahoo.com".
- Copy: brand **CG TABLES**; tagline **HANDMADE MAHJONG TABLES**; h1 lines "Tables made" / "for the" / "click of" / "tiles"; body "CG Tables builds mahjong tables by hand — made to order, delivered across the **Barrington area**. Reserve yours today for $0."; header CTA **Preorder**; hero CTAs **Reserve yours** and **See the tables**.
- Products (price 0, physical, currency USD): **The Classic**: "Square hardwood frame with a felt playing surface."; **The Fold**: "Folding legs, portable, stores flat."; **The Heirloom**: "Hardwood with drawers and built-in tile racks." Price line in the UI: "Price confirmed at consultation".
- Drawer footer: "Local pickup or delivery in the Barrington area. We'll contact you within 2 days to confirm finish, size and price."
- Every Wix request/response shape comes from `wix-headless-templates` (`shared/rest/client.ts`, `storefront/rest/cart.ts`, `storefront/rest/catalog.ts`, `storefront/app/wix/storefront/*-core.ts`) or Wix docs. Never guessed.
- No secrets in the repo. `appId` (OAuth client id) is public and may be committed.

## Review Focus

1. **Double-click on Reserve:** two clicks before the redirect must create one checkout, not two. Pinned in Task 6 (`reserve-single-flight`).
2. **Wix unreachable or catalog empty:** the drawer must still show the three model names, plus the fallback "Couldn't start checkout — call or email us" with working tel/mailto links. Pinned in Task 6 (`drawer-fallback-offline`).
3. **Back button from Wix checkout (bfcache):** returning must not leave buttons stuck disabled or the drawer half-open. Pinned in Task 6 (`pageshow-resets-buttons`).
4. **Very wide or very short viewports (2560×1080, 1280×600):** no document scroll, extra columns appear, header never covers the CTAs. Pinned in Task 3 (`layout-matrix`).
5. **Reduced motion:** with `prefers-reduced-motion: reduce`, there is no intro class, no marquee, and the drawer appears without a slide. Pinned in Task 4 (`reduced-motion`) and Task 6.

---

### Task 1: Generate the four table images

**Files:**
- Create: `cg-tables/wix-site.json` (records image URLs now; site/product ids later)

**Interfaces:**
- Produces: `wix-site.json.images = { sculpt, man, visit, sil }`, Higgsfield result URLs (temporary; Task 2 imports them to Wix).

- [ ] **Step 1:** `models_explore(action:'recommend')` for a photoreal product image model, then `generate_image_batch` with 4 prompts, 4:5 portrait, warm natural light, walnut/oak wood, jade-green felt, no text, no watermarks, no people's faces:
  - sculpt: "overhead view of a handmade square hardwood mahjong table with ivory tiles mid-game on jade felt"
  - man: "close-up of hands shuffling ivory mahjong tiles on green felt, warm light"
  - visit: "a handmade wooden mahjong table in a warm, cozy living room, four chairs"
  - sil: "close-up of a walnut mahjong table corner with an open drawer and built-in tile rack"
- [ ] **Step 2:** `jobs_wait` until done, then `show_generation_by_ids` once so the user sees them. Write the chosen URLs to `cg-tables/wix-site.json`.
- [ ] **Step 3:** Check: each URL returns `200` with an `image/*` content type (`curl -sI`). Commit `wix-site.json`.

### Task 2: Provision the Wix site, Stores and the three products

**Files:**
- Modify: `cg-tables/wix-site.json` → add `metaSiteId`, `appId`, `images` (Wix Media URLs + file ids), `products[]` (`{ id, slug, name }`)

**Interfaces:**
- Consumes: Task 1 image URLs.
- Produces: `metaSiteId`, `appId`, Wix Media URLs for `--img-*`, product ids.

- [ ] **Step 1:** `WixREADME` once (required by the Wix MCP), then provision per `wix-manage/references/sites/upload-static-site.md` § Create the site: `POST /headless-business-setup/v1/headless-business/provision`, `origin:'drop'`, name `CG Tables`, `synchronousSteps:['SET_METASITE_NAME','CONFIGURE_HEADLESS_APP']`. Save `metaSiteId`, `appId`.
- [ ] **Step 2:** Install Wix Stores per `wix-manage/references/app-installation/install-wix-apps.md`. Take the app id from `storefront/seed/seed-store.mjs`. Wait for Catalog V3 to be ready, the way the seed script does.
- [ ] **Step 3:** Import the 4 image URLs to Media Manager per `wix-manage/references/media/upload-media-to-wix.md`. Save the file ids and static URLs.
- [ ] **Step 4:** In one `ExecuteWixAPI` script (siteId = metaSiteId), create the 3 products. Build the request bodies the way `seed-store.mjs`'s builders do: physical, price 0, quantity 0, `preorder: { message: "Made to order" }`, description per Global Constraints, `imageMediaId` = sculpt→Classic, visit→Fold, sil→Heirloom. Set currency USD and local pickup/delivery ("Barrington area") through the matching `wix-manage` recipe. Create only, never delete.
- [ ] **Step 5:** Verify as a visitor: mint an anonymous token with `appId` and query products the way `storefront/rest/catalog.ts` does. Expected: exactly 3 products, names as above, price 0, each with media. Record ids/slugs in `wix-site.json` and commit.

### Task 3: Static page: tokens, fonts, header, hero, grid, responsive fit

**Files:**
- Create: `cg-tables/index.html`
- Create: `cg-tables/assets/fonts/archivo.woff2`, `cg-tables/assets/fonts/inter.woff2` (variable woff2, latin subset, from Google Fonts' css2 API with a woff2 UA)
- Test: `cg-tables/tests/layout.mjs` (Node + global Playwright, `executablePath: '/opt/pw-browsers/chromium'`, serves `cg-tables/` with `node:http`)

**Interfaces:**
- Produces: DOM per the ATRIUM prompt (`.stage`, `.hdr`, `.util`, `.grid > .col.{x3,x2,x1,c1,c2,c3} > .cell`), `fit()` on `window`, `<html>` mode classes `desk|mob|mob-l|tab|tab-l|tab-p`, `.ex1-3`, `.tall`. Buttons that open the drawer carry `data-open-drawer` (Task 6 consumes this).

- [ ] **Step 1: Write the failing test `layout-matrix`.** For each viewport `[1280×800 desk, 1920×1080 desk ex*, 2560×1080 desk ex3, 1280×600 desk, 1180×820 tab-l, 820×1180 tab-p, 390×844 mob, 844×390 mob-l]`, assert:
  - the `<html>` mode class matches;
  - `document.documentElement.scrollHeight <= innerHeight + 1` and the same for width;
  - the h1 text is `"Tables made for the click of tiles"`, case-insensitive and whitespace-collapsed;
  - `a[href="tel:+17733016638"]` and `a[href="mailto:cfgalley@yahoo.com"]` exist;
  - no console errors;
  - a screenshot is saved to the scratchpad.

  At 1280×800, also assert `.hero` left = 86px, top = 200px and width 480; `.grid` right edge = 1218px.
- [ ] **Step 2:** Run `node cg-tables/tests/layout.mjs`. Expected: FAIL (no index.html).
- [ ] **Step 3:** Write `index.html` from the ATRIUM prompt with the Global Constraints substitutions. Utility links: Tables, How it works, Gallery, FAQ, Barrington area. Main nav: Tables (+ arrow circle), How it works, Gallery, Menu. Solid tiles get centred low-contrast inline-SVG glyphs (中 red dragon on `.cream`, bamboo on `.blue`, three dots on `.yellow`) at ~38% tile width and opacity .18. Retune the `.f-*` crops so the generated images fill each tile with no stretching (start with `background-size: cover` and adjust after looking at the Task 3 screenshots).
- [ ] **Step 4:** Run the test. Expected: PASS for all 8 viewports. Look at every screenshot and fix anything visibly off.
- [ ] **Step 5:** Commit.

### Task 4: Marquee clones and load entrance

**Files:**
- Modify: `cg-tables/index.html`
- Test: `cg-tables/tests/motion.mjs`

**Interfaces:**
- Consumes: Task 3 DOM.
- Produces: `html.intro` lifecycle, `html[data-entrance="done"]`.

- [ ] **Step 1: Write failing tests.**
  - `marquee-clones`: every `.col` has 10 `.cell`s after load.
  - `marquee-speed`: at 1280×800, sample `.c1`'s computed translateY at t and t+1s after `data-entrance=done`. The delta ≈ 3.42% of column height (±0.5).
  - `entrance-done`: within 4.5s, `<html>` has no `intro` class and has `data-entrance="done"`.
  - `reduced-motion`: under `reducedMotion:'reduce'`, there is never an `intro` class and `.c1` has `animationName === 'none'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the clone loop, the pre-script `intro` guard with a 4s safety removal, and the WAAPI timeline exactly as the prompt specifies (EXPO/QUART/QUINT, HANDOFF 2.10s, CRUISE 3.42%/s, EXTRA 8%, marquee paused until T0+2100ms).
- [ ] **Step 4:** Run `motion.mjs` and `layout.mjs`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 5: Mobile and tablet menu

**Files:**
- Modify: `cg-tables/index.html`
- Test: `cg-tables/tests/menu.mjs`

- [ ] **Step 1: Write failing test `menu-keyboard`.** At 390×844 and 820×1180:
  - focus `.menu-btn` and press Enter → `header[data-open]`, `aria-expanded="true"`, and focus is on the first menu link;
  - Escape → closed, and focus is back on `.menu-btn`;
  - reopen, then click at (5, innerHeight−5) → closed;
  - reopen, then click a nav link → closed.

  At 1280×800, `.menu-btn` behaviour is not required (the desktop nav is visible).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the menu per the prompt, including the `navIn` stagger.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 6: Preorder drawer and Wix reserve flow

**Files:**
- Modify: `cg-tables/index.html` (drawer markup/CSS + an inline `<script>` section `/* wix */`)
- Test: `cg-tables/tests/drawer.mjs` (mocks `https://www.wixapis.com/**` with `page.route`)

**Interfaces:**
- Consumes: `data-open-drawer` openers (Task 3); `appId` and product ids from `wix-site.json` (inlined as `const WIX = { clientId: '<appId>' }`).
- Produces, all inside the inline script:
  - `wixToken(): Promise<string>`: anonymous visitor token, memoised, with the shape from `shared/rest/client.ts`.
  - `loadModels(): Promise<Model[]>`: `Model = { id, name, description, image }`, via `catalog.ts`'s query, run through `catalog-core.ts` functions copied in with types stripped. On failure it returns the static fallback list of the three models (image from `--img-*`, `id: null`).
  - `reserve(productId): Promise<string>`: creates the cart → checkout → redirect session the way `storefront/rest/cart.ts` does and returns the redirect `fullUrl`.

- [ ] **Step 1: Write failing tests.**
  - `drawer-a11y`: clicking each `[data-open-drawer]` opens `role=dialog[aria-modal=true]`. Focus moves inside, Tab cycles inside, Escape closes, and focus returns to the opener. A backdrop click closes it.
  - `drawer-renders-catalog`: with a mocked catalog response of 3 products, the drawer shows 3 cards with the exact names, descriptions, "Price confirmed at consultation" and a "Reserve for $0" button each.
  - `reserve-redirects`: with mocked token/cart/checkout/redirect responses, clicking Reserve on The Fold navigates to the mocked `fullUrl`, and the cart request body references The Fold's id.
  - `reserve-single-flight`: two rapid clicks produce exactly one redirect-session request, and the button is `disabled` while pending.
  - `drawer-fallback-offline`: when all wixapis requests abort, the 3 static model names still show. Reserve shows "Couldn't start checkout — call or email us" with working tel/mailto links, and the button is re-enabled.
  - `pageshow-resets-buttons`: dispatching `pageshow` with `persisted: true` re-enables all Reserve buttons and closes the drawer.
  - Reduced motion: the drawer opens with no transition (`transitionDuration` 0s).
  - Mobile 390×844: the drawer is a bottom sheet (its bottom edge = innerHeight) and the page still has no document scroll.
- [ ] **Step 2:** Run `node cg-tables/tests/drawer.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the drawer and the three functions. Take request shapes only from the template files named above. Fetch `wix-headless-templates` files once from `https://www.wix.com/skills/wix-headless-templates/{path}` into the scratchpad, and copy the form of each call, not the file.
- [ ] **Step 4:** Run all test files. Expected: PASS.
- [ ] **Step 5: Live visitor check (`ExecuteWixAPI`, per `api-run.md` § The check).** Make the page's exact calls against the real site for each of the 3 products. Expected: every status is 200 and each returns a redirect URL. **If Wix refuses a $0 checkout, stop and ask the user** (the fallback is a token price). Do not change prices unasked.
- [ ] **Step 6:** Commit.

### Task 7: Deploy to Wix, verify live, hand off

**Files:**
- Create: `cg-tables/README.md` (live URL, dashboard link, how to edit copy/images, open items)

- [ ] **Step 1:** Zip `cg-tables/` (index.html + assets/fonts; no tests, no wix-site.json) and drop it on `metaSiteId` with `UploadHeadlessWebsiteFiles` (ZIP attachment). If the attachment won't resolve, use the `ExecuteWixAPI` drop with `wix.multipart`. If binary fonts can't travel either way, inline both woff2 as base64 `src: url(data:font/woff2;base64,…)` in `index.html`, keep the declared URLs as a commented fallback, and say so in the README.
- [ ] **Step 2:** Run `layout.mjs` against the live `siteUrl` (the test takes a base-URL argument). Expected: PASS, with fonts loaded (`document.fonts.check('900 80px Archivo')` true).
- [ ] **Step 3:** Live end-to-end: in Playwright, click Reserve on The Classic and reach the Wix checkout page. Fill in test details with the user's go-ahead, place one $0 order, confirm it appears via an orders query, then cancel/archive it through the `wix-manage` orders recipe. Report the outcome faithfully.
- [ ] **Step 4:** Write the README (live URL, `https://manage.wix.com/dashboard/{metaSiteId}`, where orders show up, how to swap photos/prices, open items: real prices, real photos, custom domain). Commit and push to `claude/epic-bell-ipdrsf`.
