// How many radio streams are actually playing at once, and how loud is each in the mix?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  window.__media = []
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () { if (!window.__media.includes(this)) window.__media.push(this); return play.call(this) }
})
await page.goto(process.argv[2] ?? "http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
const report = (label) => page.evaluate((label) => {
  const playing = window.__media.filter((m) => !m.paused && m.src).map((m) => m.src.split("/").slice(-2).join("/").slice(0, 60))
  const live = window.__radio ? Object.fromEntries([...window.__radio.lives].map(([p, l]) => [p, l.state])) : "n/a"
  return `${label}\n  playing: ${playing.length} ${JSON.stringify(playing)}\n  live states: ${JSON.stringify(live)}\n  station: ${window.__radio?.signal.station}`
}, label)
for (const [band, name] of [["FM", "RNZ Concert"], ["MW", "Jazz24"], ["MW", "Hilversum"]]) {
  await page.evaluate(([b, n]) => window.agent.act({ steps: [{ ref: "Band", action: "setValue", args: [b] }, { ref: "Station", action: "setValue", args: [n] }] }), [band, name])
  await page.waitForTimeout(5000)
  console.log(await report(`tuned to ${name}:`))
}
await page.waitForTimeout(9000)
console.log(await report("9 s later, still on Hilversum:"))
await browser.close()
