import * as React from "react"
import { createStage, supportsHtmlInCanvas } from "@/gl/stage"
import { BackLabel, Controls, Dial } from "@/ui/panels"
import { installHardware } from "@/lib/install"
import { loading } from "@/gl/assets"

/** Shown while the textures, models and room load: the valves warming up. */
function Loading({ done }: { done: boolean }) {
  const [share, setShare] = React.useState(0)
  React.useEffect(() => {
    // the total grows as loads start, so only ever move forward
    const update = () => setShare((s) => Math.max(s, loading.total ? loading.done / loading.total : 0))
    loading.listeners.add(update)
    update()
    return () => void loading.listeners.delete(update)
  }, [])
  const pct = Math.round((done ? 1 : share) * 100)
  return (
    <div className="loading" data-done={done || undefined} role="status" aria-live="polite" aria-busy={!done}>
      <div className="valve" style={{ "--warm": done ? 1 : share } as React.CSSProperties}>
        <span className="filament" />
      </div>
      <p>Warming up the valves…</p>
      <div className="bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <small>{pct}%</small>
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
      <Loading done={ready} />
      {error && <div className="notice">{error}</div>}
    </>
  )
}
