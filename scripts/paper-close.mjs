// Put down from the back page: it should close first, then go down to the table.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(2000)
const box = await page.locator(".paper-sheet").first().boundingBox()
await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(1200)
for (let i = 0; i < 2; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1200) }
await page.keyboard.press("Escape")
await page.waitForTimeout(250)
await page.screenshot({ path: "shots/close-1.png" })
await page.waitForTimeout(2500)
await page.screenshot({ path: "shots/close-2.png" })
await browser.close()
