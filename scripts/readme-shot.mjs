// The README screenshot: the radio on, tuned to Christmas Vinyl, resting by the fire, the paper folded on the table.
import { chromium } from "playwright"
const url = process.argv[2] ?? "http://localhost:5199/"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto(url)
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.agent.act({ steps: [{ ref: "Station", action: "setValue", args: ["Christmas Vinyl"] }] }))
await page.waitForTimeout(4000)
await page.mouse.move(1590, 10)
await page.screenshot({ path: process.argv[3] ?? "docs/room.jpg", type: "jpeg", quality: 85 })
console.log("plate:", (await page.locator(".plate").innerText()).replace(/\n/g, " / "))
await browser.close()
