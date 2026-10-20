// layout-matrix: every responsive mode renders, locks the viewport and carries the CG Tables copy.
// Usage: node tests/layout.mjs [baseUrl]   (defaults to a local server over cg-tables/)
import { mkdirSync } from "node:fs";
import { serve, launch, check, done, SHOTS } from "./harness.mjs";

const VIEWPORTS = [
  { w: 1280, h: 800, mode: "desk" },
  { w: 1920, h: 1080, mode: "desk" }, // W = 1422 → extra = 0 per the prompt formula
  { w: 2560, h: 1080, mode: "desk", extra: true },
  { w: 1280, h: 600, mode: "desk" },
  { w: 1024, h: 700, mode: "tab-l" },
  { w: 820, h: 1180, mode: "tab-p" },
  { w: 390, h: 844, mode: "mob" },
  { w: 844, h: 390, mode: "mob-l" },
];

mkdirSync(SHOTS, { recursive: true });
const server = process.argv[2] ? null : await serve();
const base = process.argv[2] || server.url;
const browser = await launch();

for (const v of VIEWPORTS) {
  const tag = `${v.w}x${v.h}`;
  console.log(tag);
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "load" });
  await page.waitForTimeout(4600); // entrance finishes (<= 4s safety)
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const box = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right }; };
    return {
      cls: de.className,
      sh: de.scrollHeight, sw: de.scrollWidth, ih: innerHeight, iw: innerWidth,
      h1: (document.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase(),
      tel: !!document.querySelector('a[href="tel:+17733016638"]'),
      mail: !!document.querySelector('a[href="mailto:cfgalley@yahoo.com"]'),
      hero: box(".hero"), grid: box(".grid"), hdr: box(".hdr"),
      h1Fits: (() => { const h = document.querySelector(".hero h1"); return [...h.querySelectorAll(".ln > span")].every((s) => { const r = document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect().right <= document.querySelector(".hero").getBoundingClientRect().right + 1; }); })(),
      linkOneLine: (() => { const l = document.querySelector(".acts .link"); return l.offsetHeight < parseFloat(getComputedStyle(l).fontSize) * 2; })(),
      ex: /\bex[123]\b/.test(de.className),
      fonts: document.fonts.check('900 80px "Archivo"') && document.fonts.check('500 16px "Inter"'),
    };
  });
  check(`${tag} mode ${v.mode}`, r.cls.split(/\s+/).includes(v.mode), `(class="${r.cls}")`);
  check(`${tag} no vertical scroll`, r.sh <= r.ih + 1, `(${r.sh} > ${r.ih})`);
  check(`${tag} no horizontal scroll`, r.sw <= r.iw + 1, `(${r.sw} > ${r.iw})`);
  check(`${tag} headline`, r.h1 === "tables made for the click of tiles", `("${r.h1}")`);
  check(`${tag} phone + email links`, r.tel && r.mail);
  check(`${tag} fonts loaded`, r.fonts);
  check(`${tag} header pinned to top`, r.hdr && Math.abs(r.hdr.y) <= 1, JSON.stringify(r.hdr));
  check(`${tag} hero below header`, r.hero && r.hdr && r.hero.y >= r.hdr.y + r.hdr.h - 1, JSON.stringify({ hero: r.hero, hdr: r.hdr }));
  check(`${tag} headline fits hero column`, r.h1Fits);
  check(`${tag} "See the tables" on one line`, r.linkOneLine);
  check(`${tag} no console errors`, errors.length === 0, errors.join(" | "));
  if (v.extra) check(`${tag} extra columns`, r.ex, `(class="${r.cls}")`);
  if (v.w === 1280 && v.h === 800) {
    check("1280x800 hero at 86,200 w480", r.hero && Math.abs(r.hero.x - 86) < 1 && Math.abs(r.hero.y - 200) < 1 && Math.abs(r.hero.w - 480) < 1, JSON.stringify(r.hero));
    check("1280x800 grid right edge 1218", r.grid && Math.abs(r.grid.r - 1218) < 1, JSON.stringify(r.grid));
  }
  await page.screenshot({ path: `${SHOTS}/${tag}.png` });
  await page.close();
}

await browser.close();
server?.close();
done();
