// The portfolio menu: each item brings its thing into view.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: "shots/menu-0-room.png" })
for (const [i, name] of ["Work", "Write to me", "The radio", "Ask the typewriter", "The room"].entries()) {
  await page.getByRole("button", { name, exact: true }).click()
  await page.waitForTimeout(2200)
  const current = await page.locator('.menu-item[aria-current="page"]').innerText().catch(() => "none")
  console.log(name.padEnd(20), "-> current:", current, "| hud:", (await page.locator(".hud").innerText()).split("\n")[0].slice(0, 70))
  await page.screenshot({ path: `shots/menu-${i + 1}.png` })
}
await browser.close()
