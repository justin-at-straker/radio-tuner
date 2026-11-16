// One click in, one click out: the radio, the paper and the typewriter.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1800)
const here = () => page.locator('.menu-item[aria-current="page"]').innerText()
const step = async (label, x, y) => {
  await page.mouse.click(x, y)
  await page.waitForTimeout(1600)
  console.log(label.padEnd(34), "->", await here(), "| radio band:", await page.evaluate(() => window.agent.snapshot().find((c) => c.label === "Band")?.value))
}
const empty = [720, 760] // bare tabletop between the cup and the postcards
await step("click the radio's grille", 950, 250)
await step("click the room (beside the radio)", 60, 300)
const paper = await page.locator(".paper-sheet").first().boundingBox()
await step("click the newspaper", paper.x + paper.width / 2, paper.y + paper.height / 2)
await step("click away", 60, 300)
const sheet = await page.locator(".type-sheet").boundingBox()
await step("click the typewriter's sheet", sheet.x + sheet.width / 2, sheet.y + sheet.height / 2)
await step("click away", 1300, 300)
const mw = await page.getByRole("radio", { name: "MW" }).boundingBox()
await step("click the MW key (radio resting)", mw.x + mw.width / 2, mw.y + mw.height / 2)
await browser.close()
