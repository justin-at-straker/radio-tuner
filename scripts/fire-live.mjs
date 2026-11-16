// Records what the page actually plays (via a tap on the AudioContext) and reports the fire's level over time.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage()
page.on("pageerror", (e) => console.log("pageerror:", e.message))
// tap every AudioContext's destination so we can measure what reaches the speakers
await page.addInitScript(() => {
  const Orig = window.AudioContext
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a)
      const tap = this.createAnalyser()
      tap.fftSize = 2048
      const connect = AudioNode.prototype.connect
      const dest = this.destination
      const self = this
      AudioNode.prototype.connect = function (target, ...rest) {
        if (target === dest && this.context === self) connect.call(this, tap)
        return connect.call(this, target, ...rest)
      }
      window.__tap = tap
    }
  }
})
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
const levels = []
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500)
  levels.push(await page.evaluate(() => {
    const d = new Float32Array(2048); window.__tap.getFloatTimeDomainData(d)
    let s = 0; for (const v of d) s += v * v
    return Math.round(10 * Math.log10(s / d.length + 1e-12))
  }))
}
console.log("fire level every 2.5 s (dB, radio off):", levels.join(" "))
const loaded = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/ambience/fireplace.opus")))
console.log("recording fetched:", loaded)
await browser.close()
