// The typist using the room: tune the radio, then draft a letter and ask
// before posting it (answered "No thanks" here, so nothing is sent).
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto("http://localhost:5199/")
await page.locator(".loading .enter").click({ timeout: 90000 })
await page.waitForTimeout(2000)
const box = await page.locator(".type-sheet").boundingBox()
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(1200)
const value = (label) => page.evaluate((l) => window.agent.snapshot().find((c) => c.label === l)?.value, label)
const settle = async (maxS, onConfirm) => {
  let quiet = 0, last = ""
  for (let i = 0; i < maxS / 2; i++) {
    await page.waitForTimeout(2000)
    if (onConfirm && (await page.locator(".tw-confirm").count())) { await onConfirm(); onConfirm = null }
    const t = await page.locator(".tw-roll").innerText()
    const busy = await page.locator(".tw-thinking").count()
    quiet = t === last && !busy ? quiet + 1 : 0
    last = t
    if (quiet >= 4) break
  }
  return last
}
const ask = async (q) => {
  await page.locator(".tw-input").focus()
  await page.keyboard.type(q, { delay: 15 })
  await page.keyboard.press("Enter")
}

await ask("Put on some jazz, please.")
let t = await settle(200)
console.log("--- jazz\n" + t.split("\n").slice(-4).join("\n"))
console.log("radio:", { band: await value("Band"), station: await value("Station") })

await ask("Help me write to Justin. I'm Alex Test, alex@example.com. Message: I'd love to chat about an ML role. Please send it.")
t = await settle(260, async () => {
  await page.screenshot({ path: "shots/tw-confirm.png" })
  console.log("confirm on page:", (await page.locator(".tw-confirm").innerText()).replace(/\n/g, " | "))
  await page.getByRole("button", { name: "No thanks" }).click()
})
console.log("--- letter\n" + t.split("\n").slice(-6).join("\n"))
console.log("letter fields:", { name: await value("Your name"), email: await value("Your email"), letter: await value("Your letter") })
await page.screenshot({ path: "shots/tw-4-flows.png" })
await browser.close()
