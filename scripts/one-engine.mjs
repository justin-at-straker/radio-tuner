// Two copies of the audio module in one page (as a hot reload can leave), both started:
// only one engine should be left playing.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  window.__media = []
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () { if (!window.__media.includes(this)) window.__media.push(this); return play.call(this) }
})
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
// a second, separate copy of the engine module (a different URL means a separate instance), started too
await page.evaluate(async () => { const second = await import("/src/radio/audio.ts?copy=2"); second.startAudio() })
await page.evaluate(() => window.agent.act({ steps: [{ ref: "Station", action: "setValue", args: ["Jazz24"] }] }))
await page.waitForTimeout(6000)
console.log("streams playing with two engine copies:", await page.evaluate(() => window.__media.filter((m) => !m.paused && m.src).map((m) => m.src.split("/").slice(-1)[0])))
await browser.close()
