// Renders the letter email as it'll arrive, for a look before sending.
import { chromium } from "playwright"
import { readFileSync } from "node:fs"
const src = readFileSync("api/contact.ts", "utf8")
const fn = src.slice(src.indexOf("function letterHtml")).replace(/: string/g, "")
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const letterHtml = new Function("escape", fn + "\nreturn letterHtml")(esc)
const html = letterHtml("Alex Example", "alex@example.com", "Kia ora Justin,\n\nI found your radio on the table and spent far too long tuning it. I'm hiring for an ML engineer who knows translation, and your evaluation gate is exactly the kind of thing we need.\n\nCould we have a chat next week?")
const browser = await chromium.launch({ channel: "chrome" })
for (const [w, name] of [[900, "desktop"], [390, "phone"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } })
  await page.setContent(html)
  await page.screenshot({ path: `shots/letter-${name}.png`, fullPage: true })
}
await browser.close()
