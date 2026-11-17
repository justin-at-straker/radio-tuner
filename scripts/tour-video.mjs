// A short screen recording of the room: every interaction, with a visible cursor.
// Records against a local server (the live site's BotID rightly blocks automated browsers).
import { chromium } from "playwright"
const url = process.argv[2] ?? "http://localhost:5200/"
const dir = process.argv[3] ?? "shots/video"
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir, size: { width: 1440, height: 900 } } })
const page = await context.newPage()
page.on("pageerror", (e) => console.log("pageerror:", e.message))

// a cursor you can see, with a ripple on each click
await page.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div")
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-3px,-2px)" })
    document.body.appendChild(c)
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px" }, true)
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div")
      Object.assign(r.style, { position: "fixed", left: e.clientX - 18 + "px", top: e.clientY - 18 + "px", width: "36px", height: "36px", borderRadius: "50%", border: "2px solid rgba(255,230,180,0.9)", zIndex: "2147483646", pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out" })
      document.body.appendChild(r)
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0" })
      setTimeout(() => r.remove(), 500)
    }, true)
  })
})

let at = { x: 720, y: 450 }
const glide = async (x, y, ms = 650) => { await page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 16)) }); at = { x, y } }
const click = async (x, y) => { await glide(x, y); await page.waitForTimeout(180); await page.mouse.click(x, y) }
const clickBox = async (locator) => { const b = await locator.boundingBox(); await click(b.x + b.width / 2, b.y + b.height / 2) }
const wait = (ms) => page.waitForTimeout(ms)

await page.goto(url)
await page.mouse.move(at.x, at.y)
await page.locator(".loading .enter").waitFor({ state: "visible", timeout: 120000 })
await wait(1800)
await clickBox(page.locator(".loading .enter")) // Come in
await wait(2600)
await glide(400, 380, 1200); await glide(1000, 330, 1200) // a look around the table

// the radio: pick it up, switch on, tune, turn it over, put it down
await click(960, 250); await wait(1700)
await clickBox(page.getByRole("radio", { name: "FM" })); await wait(1400)
await clickBox(page.getByRole("button", { name: /^Christmas Vinyl/ })); await wait(1800)
await glide(860, 300); await page.mouse.down(); await glide(1160, 360, 900); await page.mouse.up(); await wait(1200)
await click(80, 420); await wait(2200)

// the newspaper: pick it up, turn every page, put it down
await clickBox(page.locator(".paper-sheet").first()); await wait(2200)
for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await wait(1900) }
await page.keyboard.press("Escape"); await wait(3600)

// the typewriter: ask it something, and watch it use the room
await clickBox(page.locator(".type-sheet")); await wait(1500)
await page.keyboard.type("How was this room built?", { delay: 85 })
await page.keyboard.press("Enter")
for (let i = 0; i < 30; i++) { await wait(500); if (await page.locator(".paper-sheet[data-held]").count()) break }
await wait(5200) // reading the feature it opened
await page.keyboard.press("Escape"); await wait(5500) // back to the typewriter, the reply typed out
await click(1330, 760); await wait(2200)

// the teabag's tag: a real link
await clickBox(page.getByRole("menuitem", { name: /x/ }).first().or(page.locator(".tag")).first()).catch(() => {})
await glide(...Object.values(await page.locator(".tag").boundingBox().then((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))), 900)
await wait(2200)

await context.close()
await browser.close()
console.log("recorded to", dir)
