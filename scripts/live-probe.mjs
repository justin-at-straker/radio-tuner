// Can Chrome play these live streams through Web Audio (not silent, i.e. CORS-clean)?
import { chromium } from "playwright"
const urls = process.argv.slice(2)
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage()
await page.goto("http://localhost:5199/")
for (const url of urls) {
  const r = await page.evaluate(async (url) => {
    const out = { url, hlsNative: document.createElement("audio").canPlayType("application/vnd.apple.mpegurl") }
    const c = new AudioContext()
    const el = new Audio()
    el.crossOrigin = "anonymous"
    el.src = url
    const an = c.createAnalyser()
    c.createMediaElementSource(el).connect(an)
    try { await el.play() } catch (e) { out.playError = String(e); return out }
    await new Promise((r) => setTimeout(r, 6000))
    const d = new Float32Array(an.fftSize)
    an.getFloatTimeDomainData(d)
    out.rms = Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length).toFixed(4)
    out.time = el.currentTime.toFixed(1)
    out.error = el.error?.message
    el.pause(); c.close()
    return out
  }, url)
  console.log(JSON.stringify(r))
}
await browser.close()
