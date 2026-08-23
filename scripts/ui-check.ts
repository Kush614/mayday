/**
 * Headless walkthrough of the replay UI on the golden trace.
 * Saves screenshots to docs/screenshots/ and asserts the demo path renders.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.UI_URL ?? "http://localhost:5173";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const results: { check: string; ok: boolean; detail: string }[] = [];
function record(check: string, ok: boolean, detail = "") {
  results.push({ check, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${check}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 1. Timeline renders every step of the golden trace.
const ticks = await page.locator("header ~ div button[title^='step']").count();
record("timeline renders steps", ticks >= 20, `${ticks} ticks`);
await page.screenshot({ path: `${OUT}/01-loaded.png`, fullPage: false });

// 2. Step card shows enrichment for a step that has it.
async function gotoStep(n: number) {
  await page.locator(`button[title^='step ${n} ']`).first().click();
  await page.waitForTimeout(450);
}
await gotoStep(12);
const intent = await page.locator("text=/assumptions \\(/i").count();
const chips = await page.locator("button:has-text('based on step')").count();
record("step card shows assumptions", intent > 0, `${chips} chip(s) with a basis step`);
await page.screenshot({ path: `${OUT}/02-step-card.png` });

// 3. Clicking an assumption chip jumps to its basis step.
if (chips > 0) {
  const before = await page.locator("text=/step \\d+ \\/ \\d+/").first().textContent();
  await page.locator("button:has-text('based on step')").first().click();
  await page.waitForTimeout(500);
  const after = await page.locator("text=/step \\d+ \\/ \\d+/").first().textContent();
  record("assumption chip jumps to basis step", before !== after, `${before?.trim()} → ${after?.trim()}`);
  await page.screenshot({ path: `${OUT}/03-basis-jump.png` });
} else {
  record("assumption chip jumps to basis step", false, "no chips found");
}

// 4. File panel reconstructs file state from blobs.
await gotoStep(12);
const codeLines = await page.locator("pre >> div").count();
record("file panel renders file at step", codeLines > 20, `${codeLines} lines`);

// 5. Incident overlay opens and analyzes.
await page.locator("button:has-text('Incident mode')").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-incident-overlay.png` });
const crash = `TypeError: Cannot read properties of null (reading 'toString')
    at ownerCode (/app/src/owner.ts:6:22)
    at toDTO (/app/src/items.ts:28:17)
    at listItems (/app/src/items.ts:67:17)`;
await page.locator("textarea").fill(crash);
await page.locator("button:has-text('Analyze')").click();
await page.waitForSelector("text=/forensics/i", { timeout: 120_000 });
await page.waitForTimeout(1500);
const verdict = await page.locator("text=/false assumption/i").count();
record("incident analysis renders forensics card", verdict > 0);
await page.screenshot({ path: `${OUT}/05-forensics.png`, fullPage: false });

// 6. Timeline dims to the incident chain.
const dimmed = await page.locator("button[title^='step'].opacity-15").count();
record("timeline dims to the incident chain", dimmed > 5, `${dimmed} steps dimmed`);
await page.screenshot({ path: `${OUT}/06-chain.png` });

record("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
