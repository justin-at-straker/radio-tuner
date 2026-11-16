// Does each newspaper page's text fit its sheet? (overflow right = text in a hidden extra column)
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto("http://localhost:5199/")
await page.waitForTimeout(2500)
console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".paper")].map((p, i) => {
  const boxes = [...p.querySelectorAll(".columns, .letters, .front-story, .front-side, .front-main")]
  return {
    page: i + 1,
    boxes: boxes.map((b) => ({ c: b.className, right: b.scrollWidth - b.clientWidth, down: b.scrollHeight - b.clientHeight })),
    sheetOverflow: p.scrollHeight - p.clientHeight,
  }
})), null, 1))
await browser.close()
