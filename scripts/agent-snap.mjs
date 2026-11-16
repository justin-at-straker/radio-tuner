// What the ui-sdk agent bridge exposes: the snapshot an agent sees.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
console.log(JSON.stringify(await page.evaluate(() => window.agent.snapshot()), null, 0).slice(0, 4000))
await browser.close()
