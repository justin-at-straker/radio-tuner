import * as React from "react"
import { NumberInput, NumberInputControl, NumberInputScrubArea } from "@ui-sdk/react/number-input"
import { Radio, RadioGroup } from "@ui-sdk/react/radio"
import { haptic } from "@/lib/haptics"
import { BANDS, bandById, formatFreq, freqAt, reception, tuneAt, type BandId } from "@/radio/stations"
import { createParts } from "@ui-sdk/react/primitive"
import { station } from "./station"
import { radio, useRadio } from "@/radio/store"
import { signal, startAudio } from "@/radio/audio"

// The three pieces of HTML the 3D radio wears. They're laid out here at a
// fixed size in CSS pixels (400 px to one unit of the cabinet), and the scene
// maps each one onto its face. Everything in them stays real: the text
// selects, the knobs take the keyboard, a screen reader can read the dial.

export const PX_PER_UNIT = 400
export const DIAL = { w: 720, h: 128 }
export const CONTROLS = { w: 816, h: 128 }
export const LABEL = { w: 360, h: 160 }
/** Where the scale starts and ends inside the dial, so the needle lines up. */
export const SCALE_LEFT = 64
export const SCALE_RIGHT = 20
/** Knob centres in the controls strip. */
export const KNOBS = { volume: { x: 76, y: 64 }, tuning: { x: 740, y: 64 } }

export const needleU = (tune: number) => (SCALE_LEFT + tune * (DIAL.w - SCALE_LEFT - SCALE_RIGHT)) / DIAL.w

// Every station on the set, for the Station selector: named with what's on,
// so a person's screen reader and an agent both know what they'd be tuning to.
const STATION_ITEMS = BANDS.flatMap((band) =>
  band.stations.map((st) => ({ value: st.name, label: `${st.name}: ${st.blurb ?? st.programme}`, band, station: st })),
)
const stationParts = createParts(station, { root: "div", item: "button" })

/** Where a station's name hangs off its mark (as a share of its own width):
 *  centred, except near the ends of the scale, where it leans inwards so it
 *  never runs past the edge of the glass. */
const labelAnchor = (t: number) => (t < 0.1 ? -50 * (t / 0.1) : t > 0.9 ? -50 - 50 * ((t - 0.9) / 0.1) : -50)

/** The station the dial is on now (by position, so it works before the valves warm). */
function tunedStation(bandId: BandId, tune: number) {
  const band = bandById(bandId)
  const near = reception(band, tune).filter((r) => Math.abs(r.offset) < 0.6)
  near.sort((x, y) => Math.abs(x.offset) - Math.abs(y.offset))
  return near[0]?.station.name ?? ""
}

/** Tunes the set to a station by name: switches on, picks its band, moves the needle. */
export function tuneToStation(name: string) {
  const item = STATION_ITEMS.find((i) => i.value === name)
  if (!item) return false
  startAudio()
  radio.set({ power: true, band: item.band.id, tune: tuneAt(item.band, item.station.freq) })
  return true
}

export function Dial() {
  const s = useRadio()
  // what's playing follows the records, which change on their own
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  const tuned = s.power ? tunedStation(s.band, s.tune) : ""
  const item = STATION_ITEMS.find((i) => i.value === tuned)
  const playing = !s.power ? "The radio is off" : !item ? "Between stations" : (item.station.blurb ?? "")
  return (
    <stationParts.Root
      className="dial"
      aria-label="Station"
      value={tuned}
      items={STATION_ITEMS.map(({ value, label }) => ({ value, label }))}
      nowPlaying={playing}
      onValueChange={(name: string) => {
        haptic("selection")
        tuneToStation(name)
      }}
    >
      {BANDS.map((band) => (
        <div key={band.id} className="dial-row" data-active={s.band === band.id || undefined}>
          <span className="dial-band">
            {band.label}
            <small>{band.unit}</small>
          </span>
          <div className="dial-scale">
            {band.scale.map((n) => (
              <span key={n} className="dial-num" aria-hidden style={{ left: `${tuneAt(band, n) * 100}%` }}>
                {n}
              </span>
            ))}
            {band.stations.map((st) => (
              <stationParts.Item
                key={st.name}
                value={st.name}
                className="dial-station"
                aria-label={`${st.name}, ${band.label} ${formatFreq(band, st.freq)}`}
                style={{ left: `${tuneAt(band, st.freq) * 100}%`, transform: `translateX(${labelAnchor(tuneAt(band, st.freq))}%)` }}
              >
                {st.name}
              </stationParts.Item>
            ))}
          </div>
        </div>
      ))}
    </stationParts.Root>
  )
}

function RadioKnob({
  label,
  value,
  onValueChange,
  max,
  step,
  format,
}: {
  label: string
  value: number
  onValueChange: (v: number) => void
  max: number
  step: number
  format?: Intl.NumberFormatOptions
}) {
  const last = React.useRef(value)
  const knob = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef({ value, onValueChange })
  latest.current = { value, onValueChange }
  // Scrolling over a knob turns it, focused or not. A native listener, so it
  // can stop the page (and the 3D zoom) from scrolling too.
  React.useEffect(() => {
    const el = knob.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { value: v, onValueChange: set } = latest.current
      const notch = Math.max(1, Math.round(max / 250))
      const next = Math.min(max, Math.max(0, v - Math.sign(e.deltaY) * notch * (e.shiftKey ? 5 : 1)))
      if (next === v) return
      haptic("selection")
      startAudio()
      set(next)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [max])
  return (
    <NumberInput
      min={0}
      max={max}
      step={step}
      largeStep={max / 10}
      value={value}
      wheel
      format={format}
      onValueChange={(v) => {
        if (v === null) return
        if (Math.floor(v / (max / 40)) !== Math.floor(last.current / (max / 40))) haptic("selection")
        last.current = v
        startAudio()
        onValueChange(v)
      }}
    >
      <div className="knob" ref={knob}>
        <NumberInputScrubArea className="knob-grip" orientation="horizontal" pixelsPerStep={1}>
          <svg viewBox="-50 -50 100 100" aria-hidden className="knob-scale">
            {Array.from({ length: 21 }, (_, i) => {
              const a = ((-135 + i * 13.5 - 90) * Math.PI) / 180
              const r0 = i % 5 === 0 ? 41 : 44
              return <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * 48} y2={Math.sin(a) * 48} />
            })}
          </svg>
        </NumberInputScrubArea>
        <NumberInputControl className="knob-input" aria-label={label} />
        <span className="knob-label">{label}</span>
      </div>
    </NumberInput>
  )
}

const KEYS = ["OFF", "MW", "SW", "FM"] as const

export function Controls() {
  const s = useRadio()
  const band = bandById(s.band)
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  // The station plate follows the sound, which settles a moment after the dial.
  React.useEffect(() => {
    const id = setInterval(force, 250)
    return () => clearInterval(id)
  }, [])
  const station = band.stations.find((st) => st.name === signal.station)
  return (
    <div className="controls">
      <RadioKnob
        label="Volume"
        value={Math.round(s.volume * 100)}
        max={100}
        step={1}
        onValueChange={(v) => radio.set({ volume: v / 100 })}
      />
      <div className="centre">
        <div className="plate" aria-live="polite">
          {s.power ? (
            <>
              <b>
                {formatFreq(band, freqAt(band, s.tune))}
                {station && ` · ${station.name}`}
              </b>
              <span>{station ? station.blurb : "Between stations"}</span>
            </>
          ) : (
            <span>Press a band key to switch on</span>
          )}
        </div>
        <RadioGroup
          className="keys"
          aria-label="Band"
          value={s.power ? s.band : "OFF"}
          onValueChange={(v) => {
            if (!v) return
            haptic("selection")
            startAudio()
            if (v === "OFF") radio.set({ power: false })
            else radio.set({ power: true, band: v as BandId })
          }}
        >
          {KEYS.map((k) => (
            <Radio key={k} value={k} className="key">
              {k}
            </Radio>
          ))}
        </RadioGroup>
      </div>
      <RadioKnob
        label="Fine tuning"
        value={Math.round(s.tune * 1000)}
        max={1000}
        step={1}
        onValueChange={(v) => radio.set({ tune: v / 1000 })}
      />
    </div>
  )
}

export function BackLabel() {
  return (
    <div className="label">
      <h2>Kōwhai RT-157</h2>
      <p>Seven-valve superheterodyne receiver. MW · SW · FM.</p>
      <p>230 V AC, 50 c/s, 45 W. Made in Auckland, New Zealand.</p>
      <p className="warn">Danger: high voltages inside. Refer servicing to a qualified radio technician.</p>
      <p className="serial">
        Serial № <span>157-0436</span>
      </p>
    </div>
  )
}
