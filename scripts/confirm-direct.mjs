// Pressing "Post the letter" through the bridge with the typewriter open: does the page ask?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
page.on("request", (r) => r.url().includes("/api/contact") && console.log("!! contact request sent"))
page.on("dialog", (d) => { console.log("!! browser dialog:", d.message()); d.dismiss() })
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(1500)
await page.getByRole("button", { name: "Ask the typewriter", exact: true }).click()
await page.waitForTimeout(1000)
const pending = page.evaluate(() => window.agent.act({ steps: [
  { ref: "Your name", action: "setValue", args: ["Alex Test"] },
  { ref: "Your email", action: "setValue", args: ["alex@example.com"] },
  { ref: "Your letter", action: "setValue", args: ["Testing the typewriter, please ignore."] },
  { ref: "Post the letter", action: "press" },
] }).then((r) => JSON.stringify(r).slice(0, 600)))
await page.waitForTimeout(1500)
console.log("confirm shown:", await page.locator(".tw-confirm").count(), "| typewriter open:", await page.evaluate(() => document.querySelector(".type-sheet")?.hasAttribute("data-open")))
if (await page.locator(".tw-confirm").count()) {
  console.log("text:", await page.locator(".tw-confirm").innerText())
  await page.getByRole("button", { name: "No thanks" }).click()
}
console.log("act result:", await pending)
await browser.close()
