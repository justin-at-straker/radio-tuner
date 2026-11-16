// Vercel BotID: an invisible check that the letters form and the typewriter
// are used by people, not bots. It must start before either is called.
import { initBotId } from "botid/client/core"
initBotId({
  protect: [
    { path: "/api/contact", method: "POST" },
    { path: "/api/typist", method: "POST" },
  ],
})
// The ui-sdk agent bridge must exist before the app renders, so it sees every component.
import "@/ai/ui-agent"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
