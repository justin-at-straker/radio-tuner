// The paper held open at the user's screen shape: is the cup clear of it, during the lift and once open?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1352, height: 929 } })
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
await page.getByRole("button", { name: "Work", exact: true }).click()
for (const [i, ms] of [[0, 150], [1, 150], [2, 150], [3, 1800]]) {
  await page.waitForTimeout(ms)
  await page.screenshot({ path: `shots/cup-${i}.png` })
}
await page.getByRole("button", { name: "Write to me", exact: true }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: "shots/cup-4.png" })
await browser.close()
