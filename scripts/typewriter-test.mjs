// The typewriter, end to end: sit at it, ask a question, watch the typist
// answer and use the room through the ui-sdk agent bridge.
import { chromium } from "playwright"
const ask = process.argv[2] ?? "What does Justin do? Show me his work."
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)))
page.on("response", (r) => r.url().includes("/api/typist") && console.log("api:", r.status()))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(2000)
await page.screenshot({ path: "shots/tw-0-rest.png" })
const box = await page.locator(".type-sheet").boundingBox()
console.log("sheet on screen:", box && Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)])))
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(1500)
console.log("focused:", await page.evaluate(() => document.activeElement?.className))
await page.screenshot({ path: "shots/tw-1-open.png" })
await page.keyboard.type(ask, { delay: 25 })
await page.keyboard.press("Enter")
const hud = () => page.locator(".hud").innerText().then((t) => t.split("\n")[0])
let last = ""
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(2000)
  const text = await page.locator(".tw-roll").innerText()
  const h = await hud()
  if (text !== last) console.log(`[${i * 2}s] hud: ${h.slice(0, 60)}\n${text.split("\n").slice(-6).join("\n")}\n`)
  last = text
  if (i === 6) await page.screenshot({ path: "shots/tw-2-mid.png" })
  const done = await page.evaluate(() => !document.querySelector(".tw-thinking") && document.querySelectorAll(".tw-said, .tw-did").length > 0)
  if (done && i > 10 && text === last) {
    await page.waitForTimeout(6000)
    break
  }
}
await page.screenshot({ path: "shots/tw-3-after.png" })
console.log("final hud:", await hud())
await browser.close()
