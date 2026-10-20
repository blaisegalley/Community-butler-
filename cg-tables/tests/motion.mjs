// Marquee clones + speed, the load entrance, and reduced motion.
// Usage: node tests/motion.mjs [baseUrl]
import { serve, launch, check, done } from "./harness.mjs";

const server = process.argv[2] ? null : await serve();
const base = process.argv[2] || server.url;
const browser = await launch();

// marquee-clones, entrance-done, marquee-speed (1280×800, motion allowed)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base);
  const entering = await page.evaluate(() => document.querySelector(".hdr").getAnimations().some((a) => a.playState === "running"));
  check("header entrance running on load", entering);
  const counts = await page.$$eval(".col", (cols) => cols.map((c) => c.children.length));
  check("marquee-clones: every column has 10 cells", counts.every((n) => n === 10), JSON.stringify(counts));
  const jumps = await page.evaluate(() => new Promise((ok) => {
    const cols = [...document.querySelectorAll(".c1, .c2, .c3")];
    const ty = (c) => c.getBoundingClientRect().top;
    let prev = cols.map(ty), worst = 0;
    const t0 = performance.now();
    const tick = () => {
      const cur = cols.map(ty);
      if (performance.now() - t0 > 1200) worst = Math.max(worst, ...cur.map((y, i) => Math.abs(y - prev[i])));
      prev = cur;
      performance.now() - t0 < 2800 ? requestAnimationFrame(tick) : ok(worst);
    };
    requestAnimationFrame(tick);
  }));
  check("seamless handoff (no per-frame jump > 12px after 1.2s)", jumps <= 12, `(worst ${jumps.toFixed(1)}px)`);
  let entrance = false;
  try {
    await page.waitForFunction(() => !document.documentElement.classList.contains("intro") && document.documentElement.dataset.entrance === "done", null, { timeout: 4500 });
    entrance = true;
  } catch {}
  check("entrance-done within 4.5s", entrance);
  await page.waitForTimeout(300);
  const speed = await page.evaluate(() => new Promise((ok) => {
    const col = document.querySelector(".c1");
    const ty = () => new DOMMatrix(getComputedStyle(col).transform).m42;
    const sample = () => {
      const a = ty(), t0 = performance.now();
      setTimeout(() => {
        const b = ty(), dt = (performance.now() - t0) / 1000;
        if (b > a) return sample(); // wrapped mid-sample
        ok({ pctPerSec: ((a - b) / col.offsetHeight) * 100 / dt, running: getComputedStyle(col).animationPlayState });
      }, 1000);
    };
    sample();
  }));
  check("marquee-speed ≈ 3.42%/s", Math.abs(speed.pctPerSec - 3.42) <= 0.5, JSON.stringify(speed));
  const dirs = await page.$$eval(".c1, .c2, .c3", (cols) => cols.map((c) => getComputedStyle(c).animationName));
  check("alternating directions", dirs.join() === "colDown,colUp,colDown", dirs.join());
  const lines = await page.$$eval(".hero h1 .ln > span", (s) => s.map((e) => getComputedStyle(e).transform));
  check("h1 lines settled", lines.every((t) => t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t)), lines.join(" | "));
  check("masking removed", !(await page.$eval(".hero h1", (h) => h.classList.contains("masking"))));
  await page.close();
}

// reduced-motion
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base);
  const r = await page.evaluate(() => ({
    intro: document.documentElement.classList.contains("intro"),
    anim: getComputedStyle(document.querySelector(".c1")).animationName,
    hdrOpacity: getComputedStyle(document.querySelector(".hdr")).opacity,
  }));
  check("reduced-motion: no intro class", !r.intro);
  check("reduced-motion: no marquee", r.anim === "none", r.anim);
  check("reduced-motion: header visible", r.hdrOpacity === "1", r.hdrOpacity);
  await ctx.close();
}

await browser.close();
server?.close();
done();
