import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("response", (r) => { if (r.status() >= 400) console.log(`${r.status()}  ${r.url()}`); });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
for (const step of [1, 2, 9, 12, 24]) {
  await page.locator(`button[title^='step ${step} ']`).first().click().catch(() => {});
  await page.waitForTimeout(400);
}
await browser.close();
