// The link preview image (1200x630): the room, the radio on, the paper on the table.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
await page.evaluate(() => window.agent.act({ steps: [{ ref: "Station", action: "setValue", args: ["RNZ Concert"] }] }))
await page.waitForTimeout(3000)
await page.addStyleTag({ content: ".hud,.menu-items{display:none!important}" })
await page.screenshot({ path: "public/og.jpg", type: "jpeg", quality: 86 })
await browser.close()
