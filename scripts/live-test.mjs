// The live RNZ stations, in the app: tune in, hear it come in, check the dial.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
const state = () => page.evaluate(() => {
  const a = window.__radio
  const live = Object.fromEntries([...a.lives].map(([p, l]) => [p, l.state]))
  return { power: a.power(), station: a.signal.station, strength: +a.signal.strength.toFixed(2), level: +a.signal.level.toFixed(3), hiss: +a.signal.hiss.toFixed(2), live }
})
const ALL = [["MW", "The Twenties"], ["MW", "RNZ National"], ["MW", "Jazz24"], ["MW", "Hilversum"], ["MW", "Lahaina"], ["SW", "Bucharest"], ["FM", "RNZ Concert"], ["FM", "Christmas Vinyl"], ["FM", "Classic Vinyl"]]
for (const [band, name] of ALL) {
  await page.evaluate(([band, name]) => window.agent.act({ steps: [{ ref: "Band", action: "setValue", args: [band] }, { ref: "Station", action: "setValue", args: [name] }] }), [band, name])
  await page.waitForTimeout(700)
  await page.waitForTimeout(4500)
  const st = await state()
  console.log(band.padEnd(3), name.padEnd(16), st.station === name && st.level > 0.005 ? "OK  " : "FAIL", JSON.stringify({ station: st.station, strength: st.strength, level: st.level }))
  if (name === "Jazz24" || name === "Bucharest" || name === "Christmas Vinyl") await page.screenshot({ path: `shots/live-dial-${band}.png`, clip: { x: 630, y: 355, width: 560, height: 110 } })
}
await browser.close()
