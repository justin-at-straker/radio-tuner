import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage()
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
const stats = await page.evaluate(async () => {
  const { startFireplace } = await import("/src/radio/fireplace.ts")
  const c = new OfflineAudioContext(2, 48000 * 3, 48000)
  const f = startFireplace(c)
  await new Promise((r) => setTimeout(r, 100)) // let the crackle scheduler queue its first few
  const buf = await c.startRendering()
  f.stop()
  const l = buf.getChannelData(0), r = buf.getChannelData(1)
  let sum = 0, peak = 0, sumL = 0, sumR = 0
  for (let i = 48000 * 1.5; i < l.length; i++) { sum += l[i] * l[i] + r[i] * r[i]; sumL += l[i] * l[i]; sumR += r[i] * r[i]; peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])) }
  const n = l.length - 48000 * 1.5
  return { rmsDb: (10 * Math.log10(sum / (2 * n))).toFixed(1), peak: peak.toFixed(3), leftOverRight: (sumL / sumR).toFixed(2) }
})
console.log("fire, after fade-in:", stats)
await page.mouse.click(50, 50)
await page.waitForTimeout(1500)
console.log("live page ok after first click")
await browser.close()
