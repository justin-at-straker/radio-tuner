// The ui-sdk agent bridge: lets an agent read and operate every ui-sdk
// component on the page (the radio's Station selector, its Band keys, the
// Volume and Fine tuning knobs) through each component's own API, with
// changes reported as source "agent". It sees the radio's controls exactly as
// a flat form, even though they're drawn on a 3D radio by HTML-in-Canvas.
//
// Created when this module loads; main.tsx imports it before the app renders
// so it hears every component as it's made.
//
// Two ways in:
//   - window.agent in the console: snapshot(), query(), act()
//   - WebMCP: in a browser with document.modelContext (such as ChatGPT's
//     built-in browser), the same three tools are registered for its agent.
import { agentTools, createAgent, registerTools } from "@ui-sdk/react/agent"

export type UiAgent = ReturnType<typeof createAgent>

let agent: UiAgent | null = null

/** The page's one bridge, created on first use. */
export function getUiAgent(): UiAgent {
  agent ??= createAgent({
    // An agent may tune, switch bands and set the volume freely, but
    // switching the radio off is the person's call.
    allow: (step) => {
      const off = step.label === "Band" && step.action === "setValue" && String(step.args[0]).toUpperCase() === "OFF"
      return off ? window.confirm("An assistant wants to switch the radio off. Allow it?") : true
    },
  })
  return agent
}

export { agentTools }

if (typeof document !== "undefined") {
  const bridge = getUiAgent()
  Object.assign(window, { agent: bridge })
  // The bridge's allow above already asks the person, so WebMCP doesn't ask again.
  const unregister = registerTools(bridge, { allow: () => true })
  if (import.meta.hot) import.meta.hot.dispose(unregister)
}
