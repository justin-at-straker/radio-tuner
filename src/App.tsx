import * as React from "react"
import { createStage, supportsHtmlInCanvas } from "@/gl/stage"
import { BackLabel, Controls, Dial } from "@/ui/panels"
import { installHardware } from "@/lib/install"
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
    <div className="loading" data-ready={ready || undefined} data-done={entered || undefined} aria-hidden={entered || undefined}>
      <div className="valve" style={{ "--warm": ready ? 1 : share } as React.CSSProperties}>
        <span className="filament" />
      </div>
      <p role="status" aria-live="polite">
        {ready ? "The valves are warm." : "Warming up the valves…"}
      </p>
      {ready ? (
        <button ref={enter} className="enter" onClick={onEnter}>
          Enter
        </button>
      ) : (
        <>
          <div className="bar" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
          <small>{pct}%</small>
        </>
      )}
    </div>
  )
}

export function App() {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const dial = React.useRef<HTMLDivElement>(null)
  const controls = React.useRef<HTMLDivElement>(null)
  const label = React.useRef<HTMLDivElement>(null)
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
        { dial: dial.current!, controls: controls.current!, label: label.current! },
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
      </canvas>
      <div className="hud">
        {focused
          ? "Drag to turn it over · Shift-drag to roll · Scroll to bring it closer · Double-click the room to put it down"
          : "Double-click the radio to pick it up"}
        <br />
        Music: public domain recordings via Wikimedia Commons
      </div>
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
