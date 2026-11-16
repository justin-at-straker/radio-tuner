// The typist asks before posting a letter, on its own page; we say no.
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
await page.waitForTimeout(1500)
await page.locator(".tw-input").focus()
await page.keyboard.type("Please write to Justin for me and post it straight away: my name is Alex Test, my email is alex@example.com, and the letter says: Testing the typewriter, please ignore.", { delay: 8 })
await page.keyboard.press("Enter")
let asked = false
for (let i = 0; i < 150; i++) {
  await page.waitForTimeout(2000)
  if (!asked && (await page.locator(".tw-confirm").count())) {
    asked = true
    await page.waitForTimeout(800)
    await page.screenshot({ path: "shots/tw-confirm.png" })
    console.log("asked on the page:", (await page.locator(".tw-confirm").innerText()).replace(/\n/g, " | "))
    await page.getByRole("button", { name: "No thanks" }).click()
  }
  const busy = await page.locator(".tw-thinking").count()
  if (asked && !busy && i % 5 === 0) {
    await page.waitForTimeout(8000)
    break
  }
}
console.log("asked:", asked)
console.log((await page.locator(".tw-roll").innerText()).split("\n").slice(-5).join("\n"))
await browser.close()
