# CG Tables — Landing Page + Wix Preorders (Design Spec)

Date: 2026-10-20
Status: Approved

## 1. Intent

**Outcome:** A beautiful, single-page landing site for CG Tables — a small business making
custom mahjong tables by hand — where visitors can reserve (preorder) a table for $0 and the
order lands in a Wix dashboard the owner can manage.

**Audience:** Mahjong players in the Barrington area looking for a handmade table.

**Success looks like:**
- The page reproduces the "ATRIUM MTL" reference prompt's layout, motion, typography and
  five responsive architectures, re-themed for CG Tables.
- A visitor can pick one of three models and complete a $0 Wix checkout in a few clicks.
- Each reservation appears as an order in the Wix Stores dashboard with the customer's contact info.

**What the user said vs. what is assumed**

| Decided by user | Assumed (change any of these) |
|---|---|
| Product: custom-made tables | Prices shown as "Price confirmed at consultation" (no prices yet) |
| Wix Store checkout, $0 reserve | Contact: (773) 301-6638, cfgalley@yahoo.com |
| 3 models: Classic, Fold, Heirloom | Headline: "Tables made / for the / click of / tiles" |
| Local pickup/delivery, Barrington area | Tagline: "HANDMADE MAHJONG TABLES" |
| ATRIUM layout, mahjong style | Images: 4 generated with Higgsfield (user approved credits) |
| Option 1: custom page + Wix headless checkout | Page lives in `cg-tables/` in this repo |

## 2. Architecture

```
cg-tables/
  index.html                 one self-contained file: inline <style>, inline SVG, vanilla JS
  assets/fonts/archivo.woff2  self-hosted variable font (wght 100–900, wdth 62–125)
  assets/fonts/inter.woff2    self-hosted variable font (wght 100–900)
```

Images are hosted remotely (Wix Media after upload, so the page and store share one source).
No build step, no npm, no external CSS/JS libraries — per the reference prompt.

**Wix side (created via Wix MCP):**
- A new Wix headless project with Wix Stores enabled.
- Three products, price $0, each with a description and its generated image:
  - **The Classic** — square hardwood frame, felt playing surface.
  - **The Fold** — folding legs, portable, stores flat.
  - **The Heirloom** — hardwood with drawers and built-in tile racks.
- An OAuth client ID (public, safe to embed) for anonymous visitor sessions.
- Checkout configured so a $0 order completes without a payment step; delivery set to
  local pickup / local delivery (Barrington area).

**Checkout data flow (vanilla `fetch`, no SDK):**
1. Visitor clicks **Reserve for $0** on a model.
2. JS gets an anonymous visitor token: `POST https://www.wixapis.com/oauth2/token`
   `{ clientId, grantType: "anonymous" }` (cached in memory).
3. JS creates a checkout with that product as the line item (Wix Stores app catalog reference).
4. JS creates a redirect session for the checkout and sends the browser to Wix's hosted checkout URL.
5. Visitor enters name/email/phone, places the $0 order → order appears in the Wix dashboard.

Exact endpoint shapes are confirmed against Wix docs during planning, not guessed.

**Error handling:** If any Wix call fails, the button shows "Couldn't start checkout — call or
email us" with the phone/email links, and logs the error to the console. Buttons are disabled
while a request is in flight to prevent double orders.

## 3. Page design

Follows the ATRIUM MTL prompt exactly for structure, tokens, motion, responsive modes, menu
behaviour, load entrance and accessibility. Only these things change:

**Copy**
- Title: "CG Tables — Handmade mahjong tables"
- Logo: **CG TABLES** (Archivo 900, same treatment) + "HANDMADE MAHJONG TABLES"
- Utility strip: phone `Call : (773)` / `301-6638` (tel:+17733016638) and `Email : cfgalley` / `@yahoo.com` (mailto:cfgalley@yahoo.com);
  links: Tables, How it works, Gallery, FAQ, Barrington area; search button kept.
- Main nav: Tables (+ arrow circle), How it works, Gallery, Menu.
- Header CTA: black pill **Preorder** + circle arrow.
- h1 lines: "Tables made" / "for the" / "click of" / "tiles"
- Body: "CG Tables builds mahjong tables by hand — made to order, delivered across the
  **Barrington area**. Reserve yours today for $0."
- Actions: **Reserve yours** pill + circle, and **See the tables** link with arrow circle.

**Colour tokens (mahjong palette)**
- `--paper #f3efe4` (bone), `--ink #0f0f0e`
- `--red #c8322b` (lacquer red), `--yellow #e9c46a` (gold), `--blue` → `--jade #3f8f6b`
- `--card-cream #f9f6f1`, `--card-dark #151515` unchanged
- Class names in the grid stay as in the prompt (`.blue` renders jade) to keep the spec mapping 1:1.

**Mosaic**
- Same 6 columns × 5 cells, same order, same crops logic, 14.6s loop, alternating directions.
- Four photo slots become generated images:
  - `i-sculpt` → overhead shot of a hardwood table with tiles mid-game
  - `i-man` → hands shuffling tiles on green felt
  - `i-visit` → table in a warm living room
  - `i-sil` → close-up of wood grain and a drawer with tile racks
- Solid tiles get a centred inline-SVG mahjong glyph on some cells (red dragon 中, bamboo,
  circle/dot) at low contrast, plus the grain overlay. The `--grain` CloudFront SVG from the
  prompt is kept.
- Crop percentages are retuned for the new images (tiles must look intentional, not stretched).

**Preorder drawer (new — the page is viewport-locked so preorders need an overlay)**
- Opened by the header Preorder pill, the hero "Reserve yours" pill, and "See the tables".
- Slides in from the right (bottom sheet on mobile); `role="dialog"`, `aria-modal`, focus
  trapped, Escape and backdrop click close it, focus returns to the opener.
- Lists the three models: image, name, one-line description, "Price confirmed at consultation",
  **Reserve for $0** button.
- Footer note: "Local pickup or delivery in the Barrington area. We'll contact you within
  2 days to confirm finish, size and price."
- Uses the same motion easings as the entrance; respects `prefers-reduced-motion`.

## 4. Images

Generate 4 photoreal images in Higgsfield (portrait ~4:5 for mosaic tiles), consistent warm
lighting and wood tones. Upload them to the Wix site's media and use those URLs in `:root`
and on the products. They are placeholders for the owner's real photos and are labelled as
such in the hand-off notes.

## 5. Testing

- Playwright (preinstalled Chromium) screenshots at 1280×800, 1920×1080, 2560×1080 (extra
  columns), 820×1180 (tab-p), 1180×820 (tab-l), 390×844 (mob), 844×390 (mob-l); check no
  document scroll and no console errors.
- Marquee: verify one column loops seamlessly and runs at the specified speed.
- Menu + drawer: keyboard open/close, Escape, focus return.
- Checkout: click Reserve on each model and confirm it reaches the Wix hosted checkout; place
  one test $0 order and confirm it shows in the dashboard, then cancel it.

## 6. Out of scope

- Payments, deposits, inventory, shipping rates.
- Extra pages (FAQ, gallery). Nav links scroll nowhere / open the drawer for now.
- Custom domain (can be added later via Wix).

## 7. Open items for the owner

- Real prices, once set, to replace "confirmed at consultation".
- Real table photos to replace the generated ones.
