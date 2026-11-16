// The typewriter sat at: the page square on, nothing in the way.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(2000)
const box = await page.locator(".type-sheet").boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(1800)
await page.screenshot({ path: "shots/tw-open.png" })
await browser.close()
