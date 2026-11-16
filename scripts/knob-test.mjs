import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.waitForTimeout(2000)
await page.locator(".key", { hasText: "MW" }).click()
const input = page.locator('input[aria-label="Tuning"]')
const grip = page.locator(".knob-grip").nth(1)
const box = await grip.boundingBox()
console.log("grip box", box)
const cx = box.x + box.width / 2, cy = box.y + box.height / 2
console.log("element at centre:", await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.className || e?.tagName }, [cx, cy]))
await page.evaluate(() => {
  for (const t of ["pointerdown", "pointermove", "pointerup", "wheel", "lostpointercapture"]) document.addEventListener(t, (e) => (window.__ev ??= []).push(t + ":" + (e.target.className || e.target.tagName)), true)
  const orig = Element.prototype.requestPointerLock
  Element.prototype.requestPointerLock = function (...a) { (window.__ev ??= []).push("requestPointerLock"); return orig.apply(this, a) }
})
console.log("before", await input.inputValue())
await page.mouse.move(cx, cy); await page.mouse.down()
for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 10, cy)
await page.mouse.up()
console.log("after drag", await input.inputValue())
await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.waitForTimeout(300)
console.log("after wheel", await input.inputValue())
console.log("events", (await page.evaluate(() => window.__ev)).slice(0, 12).join(" | "))
await browser.close()
