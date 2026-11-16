import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()))
const audio = []
page.on("response", (r) => r.url().includes("/music/") && audio.push(r.status() + " " + decodeURIComponent(r.url().split("/music/")[1])))
await page.goto("http://localhost:5199/")
await page.waitForTimeout(1500)
await page.locator(".key", { hasText: "MW" }).click()
await page.waitForTimeout(3000)
console.log("plate:", (await page.locator(".plate").innerText()).replace(/\n/g, " / "))
console.log("fetched:", audio.join(", "))
await browser.close()
