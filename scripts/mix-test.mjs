// Measures what reaches the speakers: fire alone, radio on the table, radio held close.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.addInitScript(() => {
  const Orig = window.AudioContext
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a)
      const tap = this.createAnalyser(); tap.fftSize = 4096
      const connect = AudioNode.prototype.connect, dest = this.destination, self = this
      AudioNode.prototype.connect = function (t, ...r) { if (t === dest && this.context === self) connect.call(this, tap); return connect.call(this, t, ...r) }
      window.__tap = tap
    }
  }
})
const level = async (n = 8) => {
  let total = 0
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(400)
    total += await page.evaluate(() => { const d = new Float32Array(4096); window.__tap.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return s / d.length })
  }
  return Math.round(10 * Math.log10(total / n + 1e-12))
}
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(4500)
console.log("fire alone:", await level(), "dB")
await page.evaluate(() => window.agent.act({ steps: [{ ref: "Station", action: "setValue", args: ["Auckland"] }] }))
await page.waitForTimeout(3000)
console.log("radio on the table (jazz) + fire:", await level(12), "dB")
const dial = await page.locator(".dial").boundingBox()
await page.mouse.dblclick(dial.x + dial.width / 2, dial.y - dial.height * 0.8)
await page.waitForTimeout(1500)
console.log("radio held close + fire:", await level(12), "dB")
await browser.close()
