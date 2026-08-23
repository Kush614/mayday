/**
 * Full demo rehearsal, headless — walks docs/DEMO-3MIN.md beat by beat against a
 * cold, offline stack and times each act. Fails loudly if any beat cannot be
 * performed, so "is it demoable?" has an evidence-backed answer.
 *
 *   AFR_OFFLINE=1 npm run dev
 *   npx tsx scripts/rehearse.ts
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const BASE = process.env.UI_URL ?? "http://localhost:5173";
const beats: { act: string; ok: boolean; ms: number; note: string }[] = [];

function log(act: string, ok: boolean, ms: number, note = "") {
  beats.push({ act, ok, ms, note });
  console.log(`${ok ? "✅" : "❌"} ${act.padEnd(34)} ${String(Math.round(ms)).padStart(6)}ms  ${note}`);
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const out = await fn();
  return [out, Date.now() - t0];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));

// ── Act 0 · the app comes up ────────────────────────────────────────────────
{
  const [, ms] = await timed(async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector("button[title^='step 1 ']", { timeout: 30_000 });
  });
  const ticks = await page.locator("button[title^='step']").count();
  log("app loads, golden trace ready", ticks >= 24, ms, `${ticks} steps`);
}

// ── Act 1 · the agent ships: tests are green ───────────────────────────────
{
  const t0 = Date.now();
  let green = false;
  let note = "";
  try {
    const out = execFileSync("npx", ["vitest", "run", "--root", "demo/target-app"], {
      encoding: "utf8",
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    green = /Tests\s+\d+ passed/.test(out) && !/failed/.test(out);
    note = (out.match(/Tests\s+.*/) ?? ["?"])[0].trim();
  } catch (err) {
    note = String((err as { stdout?: string }).stdout ?? err).slice(-120);
  }
  log("act 1 · unit tests green", green, Date.now() - t0, note);
}

// ── Act 2 · production disagrees ───────────────────────────────────────────
{
  const t0 = Date.now();
  let crashed = false;
  let note = "";
  try {
    execFileSync("npm", ["run", "prod-sim", "--workspace", "@mayday/target-app"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    note = "prod-sim PASSED — the demo needs it to crash";
  } catch (err) {
    const out = String((err as { stdout?: string }).stdout ?? "");
    crashed = /TypeError: Cannot read properties of null/.test(out);
    note = crashed ? "TypeError at items.ts:67" : out.slice(-120);
  }
  log("act 2 · prod-sim crashes", crashed, Date.now() - t0, note);
}

// ── Act 3 · incident mode ──────────────────────────────────────────────────
const CRASH = `TypeError: Cannot read properties of null (reading 'toString')
    at ownerCode (/app/demo/target-app/src/owner.ts:6:22)
    at toDTO (/app/demo/target-app/src/items.ts:28:17)
    at listItems (/app/demo/target-app/src/items.ts:67:17)`;

{
  const [, ms] = await timed(async () => {
    await page.locator("button:has-text('Incident mode')").click();
    await page.waitForTimeout(250);
    await page.locator("textarea").fill(CRASH);
    await page.locator("button:has-text('Analyze')").click();
    await page.waitForSelector("text=/forensics/i", { timeout: 60_000 });
    await page.waitForTimeout(600);
  });
  const step = (await page.locator("text=/wrote the failing line/i").first().textContent()) ?? "";
  log("act 3 · crash → root cause", /step 12/i.test(step), ms, step.trim());
}

{
  const vh = page.viewportSize()?.height ?? 0;
  const before = await page.locator("text=/what the agent believed/i").first().boundingBox();
  const after = await page.locator("text=/what is actually true/i").first().boundingBox();
  const visible = Boolean(before && after && before.y < vh && after.y < vh);
  log("act 3 · before/after on screen", visible, 0, visible ? "no scrolling needed" : "below the fold");
}

{
  const [, ms] = await timed(async () => {
    await page.locator("button:has-text('belief formed here')").first().click();
    await page.waitForTimeout(500);
  });
  const at = (await page.locator("text=/step \\d+ \\/ \\d+/").first().textContent()) ?? "";
  log("act 3 · jump to the basis step", /step 9 /.test(at), ms, at.trim());
}

// ── Act 4 · time travel ────────────────────────────────────────────────────
{
  const [, ms] = await timed(async () => {
    await page.locator("button:has-text('Re-run from step')").click();
    await page.waitForSelector("text=/tests passed in sandbox|tests still failing/i", { timeout: 180_000 });
    await page.waitForTimeout(400);
  });
  const verdict = (await page.locator("text=/tests passed in sandbox|tests still failing/i").first().textContent()) ?? "";
  log("act 4 · sandbox re-run", /passed/i.test(verdict), ms, verdict.trim());
}

// ── Supporting tabs ────────────────────────────────────────────────────────
{
  const [, ms] = await timed(async () => {
    await page.locator("button:has-text('demo')").first().click();
    await page.waitForTimeout(900); // the belief pair is fetched on mount
  });
  const headline = await page.locator("h1").first().textContent();
  log("demo tab renders", Boolean(headline), ms, headline?.slice(0, 40) ?? "");

  // Check while the demo tab is still mounted, not after navigating away.
  const belief = await page.locator("text=/what the agent believed/i").count();
  log("demo tab shows before/after", belief > 0, 0, `${belief} panel(s)`);
}

{
  const [, ms] = await timed(async () => {
    await page.locator("button:has-text('about')").first().click();
    await page.waitForTimeout(600);
  });
  const headline = await page.locator("h1").first().textContent();
  log("about tab renders", Boolean(headline), ms, headline?.slice(0, 40) ?? "");
}

log("no console errors", errors.length === 0, 0, errors.slice(0, 1).join("") || "clean");

await browser.close();

const failed = beats.filter((b) => !b.ok);
const total = beats.reduce((n, b) => n + b.ms, 0);
console.log(`\n${beats.length - failed.length}/${beats.length} beats · ${(total / 1000).toFixed(1)}s of wall clock`);
if (failed.length) console.log(`FAILED: ${failed.map((f) => f.act).join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);
