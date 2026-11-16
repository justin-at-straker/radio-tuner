// Does this Chrome have the built-in model (Gemini Nano, Prompt API), and can it use tools?
import { chromium } from "playwright"
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage()
await page.goto("http://localhost:5199/")
console.log(await page.evaluate(async () => {
  const out = { version: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], LanguageModel: typeof globalThis.LanguageModel }
  if (globalThis.LanguageModel) {
    try { out.availability = await LanguageModel.availability() } catch (e) { out.availabilityError = String(e) }
    try { out.availabilityWithTools = await LanguageModel.availability({ tools: [{ name: "t", description: "d", inputSchema: { type: "object", properties: {} }, execute: async () => "" }] }) } catch (e) { out.toolsError = String(e).slice(0, 160) }
    try { out.params = await LanguageModel.params?.() } catch {}
  }
  return JSON.stringify(out)
}))
await browser.close()
