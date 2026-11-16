// Dev check: screenshot the radio in real Chrome and poke a control through the 3D geometry.
import { chromium } from "playwright"
const url = process.argv[2] ?? "http://localhost:5199/"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=d3d11"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("console:", m.type(), m.text()))
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto(url)
await page.waitForTimeout(2500)
await page.screenshot({ path: "shots/1-off.png" })
const key = page.locator(".key", { hasText: "MW" })
console.log("MW key box:", await key.boundingBox())
await key.click()
await page.waitForTimeout(2500)
console.log("checked:", await page.locator(".key[data-checked]").innerText())
await page.screenshot({ path: "shots/2-on.png" })
await browser.close()
