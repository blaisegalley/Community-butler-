// Preorder drawer: accessibility, catalog rendering, the reserve → Wix checkout flow and its failure modes.
// Wix is mocked with page.route; the page is served with a test client id swapped in.
// Usage: node tests/drawer.mjs
import { readFile } from "node:fs/promises";
import { serve, launch, check, done } from "./harness.mjs";

const server = await serve();
const browser = await launch();
const IMG = await readFile(new URL("../assets/img/sculpt.webp", import.meta.url));
const CHECKOUT = "https://checkout.example/session-1";

const PRODUCTS = [
  { id: "p-classic", name: "The Classic", slug: "the-classic", media: { main: { image: { url: "https://static.wixstatic.com/media/aaa~mv2.png" } } } },
  { id: "p-fold", name: "The Fold", slug: "the-fold", media: { main: { image: { url: "https://static.wixstatic.com/media/bbb~mv2.png" } } } },
  { id: "p-heirloom", name: "The Heirloom", slug: "the-heirloom", media: { main: { image: { url: "https://static.wixstatic.com/media/ccc~mv2.png" } } } },
];

// opts: { clientId, offline, redirectDelay, hangRedirect, reducedMotion, viewport }
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 800 }, reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await ctx.newPage();
  const log = [];
  await page.route(server.url, async (route) => {
    const res = await route.fetch();
    let html = await res.text();
    if (opts.clientId !== null) html = html.replace('const WIX_CLIENT_ID = "";', `const WIX_CLIENT_ID = "${opts.clientId ?? "test-client"}";`);
    await route.fulfill({ response: res, body: html });
  });
  await page.route("https://static.wixstatic.com/**", (r) => r.fulfill({ body: IMG, contentType: "image/webp" }));
  await page.route("https://checkout.example/**", (r) => r.fulfill({ body: "<title>Checkout</title>CHECKOUT", contentType: "text/html" }));
  await page.route("https://www.wixapis.com/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    log.push({ path, method: req.method(), body: req.postData() });
    if (opts.offline) return route.abort();
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/oauth2/token") return json(200, { access_token: "tok", refresh_token: "ref", expires_in: 3600 });
    if (path === "/stores/v3/products/search") return json(200, { products: PRODUCTS });
    if (path === "/ecom/v2/carts/current" && req.method() === "GET") return json(404, { message: "no cart" });
    if (path === "/ecom/v2/carts/current/add-line-items") {
      const id = JSON.parse(req.postData()).catalogItems[0].catalogReference.catalogItemId;
      return json(200, { cart: { id: "cart-1", lineItems: [{ id: "line-1", status: "IN_STOCK", quantityInfo: { confirmedQuantity: 1 }, source: { catalogReference: { catalogItemId: id } } }] } });
    }
    if (path === "/headless/v1/redirect-session") {
      if (opts.hangRedirect) return; // never answers
      if (opts.redirectDelay) await new Promise((r) => setTimeout(r, opts.redirectDelay));
      return json(200, { redirectSession: { fullUrl: CHECKOUT } });
    }
    return json(404, { message: "unmocked " + path });
  });
  await page.goto(server.url);
  await page.waitForFunction(() => document.documentElement.dataset.entrance === "done", null, { timeout: 5000 });
  return { ctx, page, log };
}
const openDrawer = (page) => page.click(".acts .pill");
const dialogOpen = (page) => page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return !!d && d.getAttribute("aria-modal") === "true" && !d.closest("[hidden]") && getComputedStyle(d).visibility !== "hidden";
});

// drawer-a11y
{
  console.log("drawer-a11y");
  const { ctx, page } = await open({ reducedMotion: "reduce" });
  const openers = await page.$$eval("[data-open-drawer]", (els) => els.map((e, i) => (e.dataset.i = i, e.getClientRects().length ? i : -1)).filter((i) => i >= 0));
  let allOpen = true, allReturn = true;
  for (const i of openers) {
    await page.click(`[data-i="${i}"]`);
    allOpen &&= await dialogOpen(page);
    await page.keyboard.press("Escape");
    allReturn &&= !(await dialogOpen(page)) && (await page.evaluate((i) => document.activeElement?.dataset.i === String(i), i));
  }
  check(`every visible opener (${openers.length}) opens the dialog`, allOpen);
  check("Escape closes and focus returns to the opener", allReturn);
  await openDrawer(page);
  check("focus moves inside the dialog", await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
  let trapped = true;
  for (let k = 0; k < 25; k++) {
    await page.keyboard.press(k % 7 === 6 ? "Shift+Tab" : "Tab");
    trapped &&= await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  }
  check("Tab stays inside the dialog", trapped);
  await page.mouse.click(20, 400); // backdrop, left of the panel
  check("backdrop click closes", !(await dialogOpen(page)));
  await ctx.close();
}

// drawer-renders-catalog
{
  console.log("drawer-renders-catalog");
  const { ctx, page, log } = await open();
  await openDrawer(page);
  await page.waitForFunction(() => document.querySelectorAll(".model").length === 3 && document.querySelector(".model")?.dataset.id);
  const cards = await page.$$eval(".model", (els) => els.map((e) => ({
    name: e.querySelector("h3")?.textContent.trim(),
    desc: e.querySelector(".model-desc")?.textContent.trim(),
    price: e.querySelector(".model-price")?.textContent.trim(),
    btn: e.querySelector("button")?.textContent.trim(),
    id: e.dataset.id,
  })));
  check("3 cards in catalog order", cards.map((c) => c.name).join() === "The Classic,The Fold,The Heirloom", JSON.stringify(cards));
  check("descriptions", cards[0].desc === "Square hardwood frame with a felt playing surface." && cards[1].desc === "Folding legs, portable, stores flat." && cards[2].desc === "Hardwood with drawers and built-in tile racks.", JSON.stringify(cards.map((c) => c.desc)));
  check("price line", cards.every((c) => c.price === "Price confirmed at consultation"));
  check("Reserve for $0 buttons", cards.every((c) => c.btn === "Reserve for $0"));
  check("catalog ids attached", cards.map((c) => c.id).join() === "p-classic,p-fold,p-heirloom");
  check("visitor token minted once", log.filter((l) => l.path === "/oauth2/token").length === 1);
  await ctx.close();
}

// reserve-redirects
{
  console.log("reserve-redirects");
  const { ctx, page, log } = await open();
  await openDrawer(page);
  await page.waitForFunction(() => document.querySelector('.model[data-id="p-fold"]'));
  await Promise.all([page.waitForURL(CHECKOUT, { timeout: 5000 }).catch(() => {}), page.click('.model[data-id="p-fold"] button')]);
  check("navigates to the Wix checkout URL", page.url() === CHECKOUT, page.url());
  const add = log.find((l) => l.path === "/ecom/v2/carts/current/add-line-items");
  const ref = add && JSON.parse(add.body).catalogItems[0].catalogReference;
  check("cart line is The Fold from Wix Stores", ref?.catalogItemId === "p-fold" && ref?.appId === "215238eb-22a5-4c36-9e7b-e7c08025e04e", JSON.stringify(ref));
  const rs = log.find((l) => l.path === "/headless/v1/redirect-session");
  check("redirect session uses the cart as checkout", rs && JSON.parse(rs.body).ecomCheckout?.checkoutId === "cart-1", rs?.body);
  await ctx.close();
}

// reserve-single-flight
{
  console.log("reserve-single-flight");
  const { ctx, page, log } = await open({ redirectDelay: 800 });
  await openDrawer(page);
  await page.waitForFunction(() => document.querySelector('.model[data-id="p-classic"]'));
  const btn = '.model[data-id="p-classic"] button';
  await page.click(btn);
  const disabled = await page.$eval(btn, (b) => b.disabled);
  await page.click(btn, { force: true }).catch(() => {});
  await page.click('.model[data-id="p-heirloom"] button', { force: true }).catch(() => {});
  await page.waitForURL(CHECKOUT, { timeout: 5000 }).catch(() => {});
  check("button disabled while pending", disabled);
  check("exactly one redirect session", log.filter((l) => l.path === "/headless/v1/redirect-session").length === 1, String(log.filter((l) => l.path === "/headless/v1/redirect-session").length));
  await ctx.close();
}

// drawer-fallback-offline
{
  console.log("drawer-fallback-offline");
  const { ctx, page } = await open({ offline: true });
  await openDrawer(page);
  await page.waitForTimeout(400);
  const names = await page.$$eval(".model h3", (e) => e.map((x) => x.textContent.trim()));
  check("static model names still shown", names.join() === "The Classic,The Fold,The Heirloom", names.join());
  await page.click(".model button");
  await page.waitForSelector(".status a[href^='tel:']", { timeout: 3000 }).catch(() => {});
  const st = await page.evaluate(() => ({
    text: document.querySelector(".status")?.textContent || "",
    tel: !!document.querySelector('.status a[href="tel:+17733016638"]'),
    mail: !!document.querySelector('.status a[href="mailto:cfgalley@yahoo.com"]'),
    enabled: [...document.querySelectorAll(".model button")].every((b) => !b.disabled),
  }));
  check("fallback message", st.text.includes("Couldn't start checkout — call or email us"), st.text);
  check("fallback tel + mailto links", st.tel && st.mail);
  check("buttons re-enabled", st.enabled);
  await ctx.close();
}

// pageshow-resets-buttons
{
  console.log("pageshow-resets-buttons");
  const { ctx, page } = await open({ hangRedirect: true, reducedMotion: "reduce" });
  await openDrawer(page);
  await page.waitForFunction(() => document.querySelector('.model[data-id="p-classic"]'));
  await page.click('.model[data-id="p-classic"] button');
  await page.waitForTimeout(200);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  const r = await page.evaluate(() => ({ enabled: [...document.querySelectorAll(".model button")].every((b) => !b.disabled) }));
  check("Reserve buttons re-enabled", r.enabled);
  check("drawer closed", !(await dialogOpen(page)));
  await ctx.close();
}

// preview mode (no Wix client id yet)
{
  console.log("preview-mode");
  const { ctx, page, log } = await open({ clientId: null });
  await openDrawer(page);
  await page.waitForTimeout(300);
  const names = await page.$$eval(".model h3", (e) => e.map((x) => x.textContent.trim()));
  check("models shown without Wix", names.join() === "The Classic,The Fold,The Heirloom", names.join());
  await page.click(".model button");
  const text = await page.$eval(".status", (s) => s.textContent);
  check("preview note instead of checkout", /preview/i.test(text), text);
  check("no Wix calls", log.length === 0, JSON.stringify(log.map((l) => l.path)));
  await ctx.close();
}

// reduced motion + mobile bottom sheet
{
  console.log("motion + mobile");
  const { ctx, page } = await open({ reducedMotion: "reduce" });
  await openDrawer(page);
  check("reduced motion: no slide", await page.$eval(".drawer-panel", (p) => getComputedStyle(p).transitionDuration.split(",").every((d) => parseFloat(d) === 0)));
  await ctx.close();
  const m = await open({ viewport: { width: 390, height: 844 } });
  await openDrawer(m.page);
  await m.page.waitForTimeout(700);
  const r = await m.page.evaluate(() => ({ bottom: document.querySelector(".drawer-panel").getBoundingClientRect().bottom, ih: innerHeight, sh: document.documentElement.scrollHeight }));
  check("mobile: bottom sheet", Math.abs(r.bottom - r.ih) <= 1, JSON.stringify(r));
  check("mobile: no document scroll", r.sh <= r.ih + 1, JSON.stringify(r));
  await m.ctx.close();
}

await browser.close();
server.close();
done();
