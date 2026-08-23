import { chromium } from "playwright";
const theme = process.argv[2] ?? "light";
const tab = process.argv[3] ?? "replay";
const out = process.argv[4] ?? "docs/screenshots/peek.png";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.evaluate((t) => { localStorage.setItem("mayday-theme", t); document.documentElement.setAttribute("data-theme", t); }, theme);
await page.waitForTimeout(400);
if (tab === "about") { await page.locator("button:has-text('about')").click(); await page.waitForTimeout(700); }
else { await page.locator("button[title^='step 12 ']").first().click(); await page.waitForTimeout(600); }
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("saved", out);
