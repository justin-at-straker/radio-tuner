import * as React from "react"
import { createStage, supportsHtmlInCanvas } from "@/gl/stage"
import { BackLabel, Controls, Dial } from "@/ui/panels"
import { installHardware } from "@/lib/install"
import { NewspaperPage, PaperAnnouncer } from "@/ui/Newspaper"
import { PAGE_COUNT, usePaper } from "@/ui/paperStore"
import { startAudio } from "@/radio/audio"
import { loading } from "@/gl/assets"

/** Shown while the textures, models and room load: the valves warming up.
 *  Once everything's in, an Enter button: the click (or key press) that lets
 *  the browser play sound, so the fire and the radio can be heard. */
function Loading({ ready, entered, onEnter }: { ready: boolean; entered: boolean; onEnter: () => void }) {
  const [share, setShare] = React.useState(0)
  React.useEffect(() => {
    // the total grows as loads start, so only ever move forward
    const update = () => setShare((s) => Math.max(s, loading.total ? loading.done / loading.total : 0))
    loading.listeners.add(update)
    update()
    return () => void loading.listeners.delete(update)
  }, [])
  const enter = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (ready) enter.current?.focus()
  }, [ready])
  const pct = Math.round((ready ? 1 : share) * 100)
  return (
    <div className="loading" data-ready={ready || undefined} data-done={entered || undefined} inert={entered}>
      <div className="welcome">
        <div className="valve" style={{ "--warm": ready ? 1 : share } as React.CSSProperties}>
          <span className="filament" />
        </div>
        <h1>Kia ora, and welcome.</h1>
        <p className="welcome-line">
          Come in out of the cold. The fire's lit, the tea's just brewed, and there's an old wireless on the table.
          Make yourself comfortable.
        </p>
        {ready ? (
          <>
            <button
              ref={enter}
              className="enter"
              onClick={() => {
                // let go of focus before the welcome becomes inert and fades away
                enter.current?.blur()
                onEnter()
              }}
            >
              Come in
            </button>
            <small className="welcome-note">Best with the sound on.</small>
          </>
        ) : (
          <>
            <p className="warming" role="status" aria-live="polite">
              Warming up the valves…
            </p>
            <div className="bar" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </div>
            <small>{pct}%</small>
          </>
        )}
      </div>
    </div>
  )
}

export function App() {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const dial = React.useRef<HTMLDivElement>(null)
  const controls = React.useRef<HTMLDivElement>(null)
  const label = React.useRef<HTMLDivElement>(null)
  const tag = React.useRef<HTMLAnchorElement>(null)
  const pages = React.useRef<HTMLDivElement[]>([])
  const paperHeld = usePaper().held
  const [supported] = React.useState(supportsHtmlInCanvas)
  const [error, setError] = React.useState<string | null>(null)
  const [focused, setFocused] = React.useState(false)
  const [ready, setReady] = React.useState(false)
  const [entered, setEntered] = React.useState(false)

  React.useEffect(installHardware, [])

  React.useEffect(() => {
    if (!supported) return
    try {
      return createStage(
        canvas.current!,
        { dial: dial.current!, controls: controls.current!, label: label.current!, tag: tag.current!, pages: pages.current },
        { onFocusChange: setFocused, onReady: () => setReady(true) },
      )
    } catch (e) {
      console.error(e)
      setError(String(e))
    }
  }, [supported])

  if (!supported)
    return (
      <div className="notice">
        <p>
          This radio needs HTML-in-Canvas: Chrome or Edge 157 or later.
        </p>
      </div>
    )

  return (
    <>
      <canvas ref={canvas} className="stage" content="drawable" aria-label="A 1950s valve radio">
        <div ref={dial} drawable="">
          <Dial />
        </div>
        <div ref={controls} drawable="">
          <Controls />
        </div>
        <div ref={label} drawable="">
          <BackLabel />
        </div>
        {/* the newspaper on the table: Justin's CV over four pages, picked up to read */}
        {Array.from({ length: PAGE_COUNT }, (_, i) => (
          <NewspaperPage key={i} index={i} ref={(el) => void (pages.current[i] = el!)} />
        ))}
        {/* a gift tag tied to the teapot: a real link, drawn into the room */}
        <a
          ref={tag}
          drawable=""
          className="tag"
          href="https://github.com/justin-at-straker/radio-tuner"
          target="_blank"
          rel="noopener"
          aria-label="View the source code on GitHub (opens in a new tab)"
        >
          <svg className="tag-mark" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span className="tag-text">
            <span className="tag-line">View the source</span>
            <span className="tag-link">on GitHub ↗</span>
          </span>
        </a>
      </canvas>
      <div className="hud">
        {paperHeld
          ? "Turn the pages with the buttons or the arrow keys · Double-click away (or press Escape) to put it down"
          : focused
            ? "Drag to turn it over · Shift-drag to roll · Scroll to bring it closer · Double-click the room to put it down"
            : "Double-click the radio, or the newspaper, to pick it up"}
        <br />
        Music: live radio, streamed from the stations themselves
      </div>
      <PaperAnnouncer />
      <Loading
        ready={ready}
        entered={entered}
        onEnter={() => {
          // the Enter press is the interaction browsers need before playing sound
          startAudio()
          setEntered(true)
        }}
      />
      {error && <div className="notice">{error}</div>}
    </>
  )
}
