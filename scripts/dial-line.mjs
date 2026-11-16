// Station names on the dial: one line per band, none touching its neighbours.
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto("http://localhost:5199/")
await page.waitForTimeout(2500)
console.log(
  await page.evaluate(() =>
    [...document.querySelectorAll(".dial-scale")]
      .map((sc) => {
        const rs = [...sc.querySelectorAll(".dial-station")].map((el) => ({ n: el.textContent, ...el.getBoundingClientRect().toJSON() }))
        const tops = { size: rs.map((r) => r.top.toFixed(2)).join(" ") }
        const gaps = rs.slice(1).map((r, i) => `${rs[i].n}|${r.n}: ${Math.round(r.left - rs[i].right)}px`)
        return `lines: ${tops.size}  gaps: ${gaps.join(", ")}`
      })
      .join("\n"),
  ),
)
await browser.close()
