/**
 * The before/after belief, close up:
 *   docs/screenshots/belief-before-after.png  — the still used in the README
 *   docs/media/belief.gif                     — the same crop, animated
 *
 * Runs the real interaction (paste → analyze → follow the chain) and captures a
 * fixed crop of the forensics card, so the two panels fill the frame instead of
 * being a detail in a full-page shot. Nothing is staged: the frames are whatever
 * the app renders.
 */
import { chromium, type Page } from "playwright";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc as any;
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.UI_URL ?? "http://localhost:5173";
mkdirSync("docs/media", { recursive: true });
mkdirSync("docs/screenshots", { recursive: true });

const CRASH = `TypeError: Cannot read properties of null (reading 'toString')
    at ownerCode (/app/demo/target-app/src/owner.ts:6:22)
    at toDTO (/app/demo/target-app/src/items.ts:28:17)
    at listItems (/app/demo/target-app/src/items.ts:67:17)`;

type Clip = { x: number; y: number; width: number; height: number };
type Frame = { data: Uint8Array; width: number; height: number };

async function analyze(page: Page) {
  await page.locator("button:has-text('Incident mode')").click();
  await page.waitForTimeout(250);
  await page.locator("textarea").fill(CRASH);
  await page.locator("button:has-text('Analyze')").click();
  await page.waitForSelector("text=/forensics/i", { timeout: 60_000 });
  await page.waitForTimeout(700);
}

async function grab(page: Page, clip: Clip): Promise<Frame> {
  const buf = await page.screenshot({ type: "png", clip });
  const png = PNG.sync.read(Buffer.from(buf));
  return { data: new Uint8Array(png.data), width: png.width, height: png.height };
}

function encode(frames: Frame[], out: string, delays: number[]) {
  const gif = GIFEncoder();
  frames.forEach((f, i) => {
    const palette = quantize(f.data, 256, { format: "rgb444" });
    const index = applyPalette(f.data, palette, "rgb444");
    gif.writeFrame(index, f.width, f.height, { palette, delay: delays[i] ?? 700 });
  });
  gif.finish();
  writeFileSync(out, Buffer.from(gif.bytes()));
  console.log(`  wrote ${out} (${frames.length} frames)`);
}

const browser = await chromium.launch();

// ── Pass 1: measure where the forensics card lands ─────────────────────────
const probe = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await probe.goto(BASE, { waitUntil: "networkidle" });
await probe.waitForTimeout(600);
await analyze(probe);

// Anchor to the card itself, not the header text — a text node's box starts
// mid-panel and clips the left border off every frame.
const card = await probe.locator("div.border-t-4").first().boundingBox();
const instruction = await probe.locator("text=/corrected instruction for the re-run/i").first().boundingBox();
if (!card || !instruction) throw new Error("could not find the forensics card");

const clip: Clip = {
  x: Math.round(card.x),
  y: Math.round(card.y),
  width: Math.round(Math.min(card.width, 1600 - card.x)),
  height: Math.round(instruction.y + instruction.height - card.y + 16),
};
console.log("forensics crop:", clip);

// A still of the same region, for the README table.
await probe.screenshot({ path: "docs/screenshots/belief-before-after.png", clip });
await probe.close();

// ── Pass 2: capture the interaction through that fixed crop ────────────────
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

const frames: Frame[] = [];
const delays: number[] = [];

// Before: the region holds an ordinary step card. No incident yet.
frames.push(await grab(page, clip));
delays.push(1100);

await analyze(page);

// The card lands: hold on it so the two panels are readable.
for (let i = 0; i < 4; i++) {
  frames.push(await grab(page, clip));
  delays.push(i === 3 ? 2200 : 900);
  await page.waitForTimeout(160);
}

// Follow the chain back to where the belief was formed.
await page.locator("button:has-text('belief formed here')").first().click();
await page.waitForTimeout(650);
frames.push(await grab(page, clip));
delays.push(1600);
frames.push(await grab(page, clip));
delays.push(1600);

encode(frames, "docs/media/belief.gif", delays);
await page.close();
await browser.close();
console.log("done");
