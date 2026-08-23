import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

await page.locator("button:has-text('demo')").click();
await page.waitForTimeout(700);
await page.screenshot({ path: "docs/screenshots/light-06-demo-guide.png" });
console.log("beats rendered:", await page.locator("text=/^say$/i").count());

// The one-click driver: opens Incident Mode with the crash already pasted.
await page.locator("button:has-text('open incident mode, pre-pasted')").click();
await page.waitForTimeout(900);
const filled = await page.locator("textarea").inputValue();
console.log("prefilled textarea chars:", filled.length);
await page.screenshot({ path: "docs/screenshots/light-07-demo-prefilled.png" });

await page.locator("button:has-text('Analyze')").click();
await page.waitForSelector("text=/forensics/i", { timeout: 120000 });
await page.waitForTimeout(900);
console.log("forensics after one click:", await page.locator("text=/what the agent believed/i").count());
console.log("page errors:", errors.length);
await browser.close();
