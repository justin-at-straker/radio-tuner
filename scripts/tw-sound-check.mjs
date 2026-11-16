// The typewriter's recordings: do they load and decode in Chrome, and does typing reach them?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const loaded = []
page.on("response", (r) => r.url().includes("/ambience/typewriter/") && loaded.push(r.status()))
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(2500)
console.log("clips fetched:", loaded.length, "all 200:", loaded.every((s) => s === 200))
console.log(await page.evaluate(async () => {
  const c = new AudioContext()
  const ok = []
  for (const n of ["key-1", "space-1", "bell", "return"]) {
    const b = await c.decodeAudioData(await (await fetch(`/ambience/typewriter/${n}.opus`)).arrayBuffer())
    ok.push(`${n} ${b.duration.toFixed(2)}s`)
  }
  return "decoded: " + ok.join(", ")
}))
// count sounds started while typing in the typewriter
await page.evaluate(() => {
  const orig = AudioBufferSourceNode.prototype.start
  window.__starts = 0
  AudioBufferSourceNode.prototype.start = function (...a) { window.__starts++; return orig.apply(this, a) }
})
await page.getByRole("button", { name: "Ask the typewriter", exact: true }).click()
await page.waitForTimeout(1200)
await page.locator(".tw-input").focus()
await page.keyboard.type("Hello there", { delay: 60 })
console.log("sounds started while typing 'Hello there' (11 keys):", await page.evaluate(() => window.__starts))
await browser.close()
