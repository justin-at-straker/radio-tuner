// The dial glass, close up, with the radio held: are the labels inside the scale and clear of the rules?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1200)
await page.evaluate(() => window.agent.act({ steps: [{ ref: "Band", action: "setValue", args: ["SW"] }, { ref: "Station", action: "setValue", args: ["Bucharest"] }] }))
// DOM check: every label inside its scale, and above the row's bottom rule
console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".dial-station")].map((el) => {
  const s = el.closest(".dial-scale").getBoundingClientRect(), r = el.getBoundingClientRect(), row = el.closest(".dial-row").getBoundingClientRect()
  return { name: el.textContent, inLeft: Math.round(r.left - s.left), inRight: Math.round(s.right - r.right), clearBottom: Math.round(row.bottom - r.bottom) }
}).filter((x) => x.inLeft < 2 || x.inRight < 2 || x.clearBottom < 1)))) 
const box = await page.locator(".dial").boundingBox()
await page.mouse.dblclick(720, 300)
await page.waitForTimeout(1800)
await page.screenshot({ path: "shots/dial-close.png", clip: { x: 0, y: 200, width: 1440, height: 420 } })
await browser.close()
