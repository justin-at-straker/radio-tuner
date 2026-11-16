// The newspaper lying on the table: the room view, and a close crop of it.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: "shots/rest-room.png" })
await page.screenshot({ path: "shots/rest-crop.png", clip: { x: 640, y: 480, width: 800, height: 420 } })
await browser.close()
