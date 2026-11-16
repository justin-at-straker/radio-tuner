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
