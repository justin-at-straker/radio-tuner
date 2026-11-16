import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on("console", (m) => (m.type() === "warning" || m.type() === "error") && console.log(m.type(), m.text().slice(0, 200)))
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.waitForTimeout(6000)
await page.screenshot({ path: "shots/5-rest.png" })
await browser.close()
