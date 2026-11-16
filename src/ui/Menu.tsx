import { Button } from "@ui-sdk/react/button"
import { paperStore, usePaper, viewOf } from "./paperStore"
import { radioFocus } from "./radioFocus"
import { typewriterStore, useTypewriter } from "./typewriterStore"

// The portfolio's menu: a nameplate across the top of the room, its items
// bringing the room's things into view (the paper at the right page, the
// typewriter, the radio) rather than going to other pages. ui-sdk Buttons, so
// they work from the keyboard and a screen reader, and an agent can press them.

type Place = "room" | "work" | "ask" | "radio" | "write"

/** Puts everything down, then brings one thing up. */
function go(place: Place) {
  const atTypewriter = place === "ask"
  paperStore.set({ held: false })
  radioFocus.request(place === "radio")
  typewriterStore.set({ open: atTypewriter })
  if (place === "work") paperStore.set({ held: true, view: viewOf(1) })
  if (place === "write") paperStore.set({ held: true, view: viewOf(3) })
}

export function Menu({ radioUp, hidden }: { radioUp: boolean; hidden: boolean }) {
  const { held, view } = usePaper()
  const { open } = useTypewriter()
  const here: Place = held ? (view === viewOf(3) ? "write" : "work") : radioUp ? "radio" : open ? "ask" : "room"
  const item = (place: Place, label: string) => (
    <Button className="menu-item" aria-current={here === place ? "page" : undefined} onClick={() => go(place)}>
      {label}
    </Button>
  )
  return (
    <nav className="menu" aria-label="Portfolio" inert={hidden} data-hidden={hidden || undefined}>
      <button type="button" className="menu-name" onClick={() => go("room")}>
        <strong>Justin Cole</strong>
        <span>AI/ML Engineer · Auckland</span>
      </button>
      <div className="menu-items">
        {item("room", "The room")}
        {item("work", "Work")}
        {item("ask", "Ask the typewriter")}
        {item("radio", "The radio")}
        {item("write", "Write to me")}
        <a className="menu-item" href="https://github.com/justin-at-straker/radio-tuner" target="_blank" rel="noopener">
          Source ↗
        </a>
      </div>
    </nav>
  )
}
