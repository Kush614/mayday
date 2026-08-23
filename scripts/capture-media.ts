/**
 * Capture the README's media: screenshots in both themes, plus animated GIFs of
 * the two moments that matter — scrubbing the trace, and running an incident.
 *
 * Frames are grabbed with Playwright and encoded with gifenc (no ffmpeg needed).
 *   npx tsx scripts/capture-media.ts
 */
import { chromium, type Page } from "playwright";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc as any;
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UI_URL ?? "http://localhost:5173";
const SHOTS = "docs/screenshots";
const MEDIA = "docs/media";
mkdirSync(SHOTS, { recursive: true });
mkdirSync(MEDIA, { recursive: true });

const GIF_W = 1100;
const GIF_H = 690;

type Frame = { data: Uint8Array; width: number; height: number };

async function grab(page: Page): Promise<Frame> {
  const buf = await page.screenshot({ type: "png" });
  const png = PNG.sync.read(Buffer.from(buf));
  return { data: new Uint8Array(png.data), width: png.width, height: png.height };
}

function encodeGif(frames: Frame[], out: string, delayMs: number): void {
  const gif = GIFEncoder();
  for (const f of frames) {
    // One shared palette per frame keeps colours stable across the flat UI.
    const palette = quantize(f.data, 256, { format: "rgb444" });
    const index = applyPalette(f.data, palette, "rgb444");
    gif.writeFrame(index, f.width, f.height, { palette, delay: delayMs });
  }
  gif.finish();
  writeFileSync(out, Buffer.from(gif.bytes()));
  console.log(`  wrote ${out} (${frames.length} frames)`);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("mayday-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.waitForTimeout(350);
}

async function gotoStep(page: Page, n: number) {
  await page.locator(`button[title^='step ${n} ']`).first().click();
  await page.waitForTimeout(320);
}

const CRASH = `TypeError: Cannot read properties of null (reading 'toString')
    at ownerCode (/app/src/owner.ts:6:22)
    at toDTO (/app/src/items.ts:28:17)
    at listItems (/app/src/items.ts:67:17)`;

const browser = await chromium.launch();

// ---------- Screenshots, both themes ----------
for (const theme of ["light", "dark"] as const) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await setTheme(page, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  await page.screenshot({ path: join(SHOTS, `${theme}-01-overview.png`) });

  await gotoStep(page, 12);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, `${theme}-02-step-and-assumptions.png`) });

  await page.locator("button:has-text('Incident mode')").click();
  await page.waitForTimeout(400);
  await page.locator("textarea").fill(CRASH);
  await page.screenshot({ path: join(SHOTS, `${theme}-03-incident-input.png`) });

  await page.locator("button:has-text('Analyze')").click();
  await page.waitForSelector("text=/forensics/i", { timeout: 120_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, `${theme}-04-forensics.png`) });

  // The sandbox re-run result, served from the demo cache.
  await page.locator("button:has-text('Re-run from step')").click();
  await page.waitForSelector("text=/tests passed in sandbox|tests still failing/i", { timeout: 180_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, `${theme}-05-sandbox-rerun.png`) });
  console.log(`✓ ${theme} screenshots`);
  await page.close();
}

// ---------- GIF 1: scrubbing the trace ----------
{
  const page = await browser.newPage({ viewport: { width: GIF_W, height: GIF_H } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await setTheme(page, "light");
  await page.waitForTimeout(800);

  const frames: Frame[] = [];
  for (const step of [1, 3, 5, 7, 9, 10, 12, 14, 17, 20, 22, 24]) {
    await gotoStep(page, step);
    frames.push(await grab(page));
  }
  encodeGif(frames, join(MEDIA, "scrub.gif"), 620);
  await page.close();
}

// ---------- GIF 2: incident mode, crash to root cause ----------
{
  const page = await browser.newPage({ viewport: { width: GIF_W, height: GIF_H } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await setTheme(page, "light");
  await page.waitForTimeout(800);

  const frames: Frame[] = [];
  frames.push(await grab(page));

  await page.locator("button:has-text('Incident mode')").click();
  await page.waitForTimeout(400);
  frames.push(await grab(page));

  // Type the stack trace in visible chunks.
  const lines = CRASH.split("\n");
  for (let i = 0; i < lines.length; i++) {
    await page.locator("textarea").fill(lines.slice(0, i + 1).join("\n"));
    await page.waitForTimeout(120);
    frames.push(await grab(page));
  }

  await page.locator("button:has-text('Analyze')").click();
  await page.waitForSelector("text=/forensics/i", { timeout: 120_000 });
  await page.waitForTimeout(900);
  for (let i = 0; i < 3; i++) {
    frames.push(await grab(page));
    await page.waitForTimeout(250);
  }

  // Follow the chain back to where the belief was formed.
  await page.locator("button:has-text('belief formed here')").first().click();
  await page.waitForTimeout(700);
  frames.push(await grab(page));
  frames.push(await grab(page));

  encodeGif(frames, join(MEDIA, "incident.gif"), 700);
  await page.close();
}

await browser.close();
console.log("done");
