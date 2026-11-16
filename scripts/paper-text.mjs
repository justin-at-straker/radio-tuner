// The newspaper's text, page by page (for the typist's briefing).
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage()
await page.goto("http://localhost:5199/")
await page.waitForTimeout(2000)
const pages = await page.evaluate(() => [...document.querySelectorAll(".paper")].map((p) => p.innerText))
pages.forEach((t, i) => console.log(`\n===== PAGE ${i + 1}\n` + t))
await browser.close()
