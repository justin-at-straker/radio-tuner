// The held paper at a few screen shapes: does the print fit, edge to edge?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
for (const [w, h] of [[1440, 900], [1920, 1080], [1100, 1000]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto("http://localhost:5199/")
  await page.locator(".loading .enter").click({ timeout: 90000 })
  await page.waitForTimeout(1200)
  const box = await page.locator(".paper-sheet").first().boundingBox()
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `shots/fit-${w}-front.png` })
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `shots/fit-${w}-spread.png` })
  await page.close()
}
await browser.close()
