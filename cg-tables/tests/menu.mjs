// menu-keyboard: the Menu button opens/closes the panel by keyboard, Escape, outside click and link click.
// Usage: node tests/menu.mjs [baseUrl]
import { serve, launch, check, done } from "./harness.mjs";

const server = process.argv[2] ? null : await serve();
const base = process.argv[2] || server.url;
const browser = await launch();

for (const [w, h] of [[390, 844], [820, 1180]]) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base);
  const state = () => page.evaluate(() => ({
    open: document.querySelector(".hdr").hasAttribute("data-open"),
    expanded: document.querySelector(".menu-btn").getAttribute("aria-expanded"),
    panelVisible: getComputedStyle(document.querySelector(".panel")).display !== "none",
    focus: document.activeElement?.matches(".menu-btn") ? "menu-btn" : document.activeElement?.closest(".panel nav") ? "first-link:" + (document.activeElement === document.querySelector(".panel nav a")) : document.activeElement?.tagName,
  }));

  await page.focus(".menu-btn");
  await page.keyboard.press("Enter");
  let s = await state();
  check(`${tag} Enter opens`, s.open && s.expanded === "true" && s.panelVisible, JSON.stringify(s));
  check(`${tag} focus on first menu link`, s.focus === "first-link:true", s.focus);

  await page.keyboard.press("Escape");
  s = await state();
  check(`${tag} Escape closes`, !s.open && s.expanded === "false" && !s.panelVisible, JSON.stringify(s));
  check(`${tag} focus back on Menu`, s.focus === "menu-btn", s.focus);

  await page.click(".menu-btn");
  await page.mouse.click(5, h - 5);
  s = await state();
  check(`${tag} outside click closes`, !s.open, JSON.stringify(s));

  await page.click(".menu-btn");
  s = await state();
  check(`${tag} click opens`, s.open);
  await page.click(".panel nav a:nth-child(2)");
  s = await state();
  check(`${tag} nav link click closes`, !s.open, JSON.stringify(s));
  await ctx.close();
}

await browser.close();
server?.close();
done();
