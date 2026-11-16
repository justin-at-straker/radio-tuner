// Turns the newspaper's pages and measures the sound each turn makes at the speakers.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.addInitScript(() => {
  const Orig = window.AudioContext
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a)
      const tap = this.createAnalyser(); tap.fftSize = 2048
      const connect = AudioNode.prototype.connect, dest = this.destination, self = this
      AudioNode.prototype.connect = function (t, ...r) { if (t === dest && this.context === self) connect.call(this, tap); return connect.call(this, t, ...r) }
      window.__tap = tap
    }
  }
})
const peak = () => page.evaluate(async () => {
  let p = 0
  for (let i = 0; i < 25; i++) { await new Promise((r) => setTimeout(r, 40)); const d = new Float32Array(2048); window.__tap.getFloatTimeDomainData(d); for (const v of d) p = Math.max(p, Math.abs(v)) }
  return Math.round(20 * Math.log10(p + 1e-9))
})
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(3000)
console.log("quiet room (fire), peak dB:", await peak())
const box = await page.locator(".paper-sheet").first().boundingBox()
await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
console.log("picking it up, peak dB:", await peak())
for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); console.log(`turn ${i + 1}, peak dB:`, await peak()) }
await browser.close()
