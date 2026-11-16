// The paper with its new middle spread: open it at the feature, then turn through every view.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
await page.getByRole("button", { name: "How it's made", exact: true }).click()
await page.waitForTimeout(2600)
await page.screenshot({ path: "shots/feature-spread.png" })
console.log("current:", await page.locator('.menu-item[aria-current="page"]').innerText())
await page.keyboard.press("Escape")
await page.waitForTimeout(3500)
await page.getByRole("button", { name: "Work", exact: true }).click()
await page.waitForTimeout(2200)
for (let v = 1; v <= 3; v++) {
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(400)
  if (v === 2) await page.screenshot({ path: "shots/feature-turning.png" })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `shots/feature-view${v + 1}.png` })
}
await browser.close()
