import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.locator("button:has-text('Incident mode')").click();
await page.waitForTimeout(300);
await page.locator("textarea").fill(`TypeError: Cannot read properties of null (reading 'toString')
    at ownerCode (/app/src/owner.ts:6:22)
    at listItems (/app/src/items.ts:67:17)`);
await page.locator("button:has-text('Analyze')").click();
await page.waitForSelector("text=/forensics/i", { timeout: 120000 });
await page.waitForTimeout(1200);
const box = await page.locator("text=/forensics/i").first().boundingBox();
const before = await page.locator("text=/what the agent believed/i").first().boundingBox();
const after = await page.locator("text=/what is actually true/i").first().boundingBox();
console.log("viewport height        : 1000");
console.log("forensics header y     :", box?.y?.toFixed(0), box && box.y < 1000 ? "(visible ✅)" : "(BELOW FOLD ❌)");
console.log("BEFORE panel y         :", before?.y?.toFixed(0), before && before.y < 1000 ? "visible ✅" : "BELOW FOLD ❌");
console.log("AFTER panel y          :", after?.y?.toFixed(0), after && after.y < 1000 ? "visible ✅" : "BELOW FOLD ❌");
await page.screenshot({ path: "docs/screenshots/light-04-forensics.png" });
await browser.close();
