import { BANDS, bandById, freqAt, LIVE, reception, type Programme } from "./stations"

const ALL_PROGRAMMES = [...new Set(BANDS.flatMap((b) => b.stations.map((s) => s.programme)))]
import { radio } from "./store"
import { startFireplace, type Fireplace } from "./fireplace"
import { startPaperSounds, type PaperSounds } from "./paperSounds"
import { createRoomAcoustics, type RoomAcoustics } from "./acoustics"

// Everything you hear is made here, live: no samples. Each programme is a
// small generator scheduled a little ahead of time; tuning only moves gains.
//
//   programmes -> per-programme gain ┐
//   hiss -> bandpass -> hiss gain    ├-> "valve" filter + soft clip -> volume -> analyser -> out
//   whistle (heterodyne) -> gain     ┘

let ctx: AudioContext | null = null
let fireplace: Fireplace | null = null
let paperSounds: PaperSounds | null = null
let acoustics: RoomAcoustics | null = null
let closeness = 0

/** How near the radio is: 0 resting on the table, 1 picked up and held close. */
export function setRadioCloseness(x: number) {
  closeness = x
  acoustics?.setCloseness(x)
}
// everything that keeps sounding, so the engine can be shut down completely
const timers: ReturnType<typeof setInterval>[] = []
const elements: HTMLAudioElement[] = []
let analyser: AnalyserNode
let master: GainNode
let lowpass: BiquadFilterNode
let hissGain: GainNode
let whistle: OscillatorNode
let whistleGain: GainNode
const programmeGain = new Map<Programme, GainNode>()
const level = new Float32Array(1024)
let speakingWeather = false
let weatherVolume = 0

/** What the scene needs each frame. */
export const signal = { strength: 0, level: 0, station: null as string | null, programme: null as Programme | null, hiss: 0 }

// ---------------------------------------------------------------- live stations
//
// The RNZ stations stream for real. A live stream only runs while you're tuned
// near it (and for a few seconds after, so sweeping past doesn't reconnect),
// so nobody downloads radio they aren't listening to. Connecting sounds like
// tuning in: mostly static until the audio arrives. A stream that fails is just
// static on that spot of the dial.

type LiveState = "idle" | "loading" | "playing" | "error"
interface Live {
  el: HTMLAudioElement
  url: string
  state: LiveState
  lastWanted: number
}
const lives = new Map<Programme, Live>()

function startLive(c: AudioContext, p: Programme, url: string, out: AudioNode) {
  const el = new Audio()
  el.crossOrigin = "anonymous" // the streams send CORS headers; without this Web Audio hears silence
  el.preload = "none"
  elements.push(el)
  c.createMediaElementSource(el).connect(out)
  const live: Live = { el, url, state: "idle", lastWanted: 0 }
  el.addEventListener("playing", () => (live.state = "playing"))
  el.addEventListener("waiting", () => live.state !== "idle" && (live.state = "loading"))
  el.addEventListener("error", () => live.state !== "idle" && (live.state = "error"))
  lives.set(p, live)
}

/** Connect the live streams you're near; let go of the ones you've left. */
function tendLive(totals: Map<Programme, number>, on: boolean) {
  const t = performance.now()
  for (const [p, live] of lives) {
    const wanted = on && (totals.get(p) ?? 0) > 0.02
    if (wanted) {
      live.lastWanted = t
      if (live.state === "idle") {
        live.state = "loading"
        live.el.src = live.url // a fresh connection lands at the live edge
        void live.el.play().catch(() => (live.state = "error"))
      }
    } else if (live.state !== "idle" && t - live.lastWanted > 8000) {
      live.el.pause()
      live.el.removeAttribute("src")
      live.el.load()
      live.state = "idle" // an error clears too: next time you tune in, it tries again
    }
  }
}

/** How much of a station's signal is really there: a live one connecting is mostly static. */
const liveFactor = (p: Programme) => {
  const live = lives.get(p)
  if (!live) return 1
  return live.state === "playing" ? 1 : live.state === "error" ? 0 : 0.25
}

function noiseBuffer(c: AudioContext, seconds = 2) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function softClip(amount = 2.2) {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}

export function startAudio() {
  if (ctx) {
    void ctx.resume()
    return
  }
  ctx = new AudioContext()
  const c = ctx
  // the room's own sound: the fire, quietly, whatever the radio is doing
  fireplace = startFireplace(c)
  // ...and the newspaper, as its pages turn
  paperSounds = startPaperSounds(c)
  analyser = c.createAnalyser()
  analyser.fftSize = 1024
  master = c.createGain()
  master.gain.value = 0
  lowpass = c.createBiquadFilter()
  lowpass.type = "lowpass"
  lowpass.frequency.value = 3800
  lowpass.Q.value = 0.9
  const highpass = c.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 140
  const clip = c.createWaveShaper()
  clip.curve = softClip()
  const bus = c.createGain()
  bus.gain.value = 0.7
  bus.connect(highpass).connect(lowpass).connect(clip).connect(master).connect(analyser)
  // ...and out into the room: a little reverb and placement, not straight into your ears
  acoustics = createRoomAcoustics(c, analyser)
  acoustics.setCloseness(closeness)

  // Hiss between stations.
  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c)
  noise.loop = true
  const hissBand = c.createBiquadFilter()
  hissBand.type = "bandpass"
  hissBand.frequency.value = 2400
  hissBand.Q.value = 0.4
  hissGain = c.createGain()
  hissGain.gain.value = 0
  noise.connect(hissBand).connect(hissGain).connect(bus)
  noise.start()

  // The whistle you get just off a carrier: pitch falls as you close in.
  whistle = c.createOscillator()
  whistle.type = "sine"
  whistleGain = c.createGain()
  whistleGain.gain.value = 0
  whistle.connect(whistleGain).connect(bus)
  whistle.start()

  for (const p of ALL_PROGRAMMES) {
    const g = c.createGain()
    g.gain.value = 0
    g.connect(bus)
    programmeGain.set(p, g)
    const url = LIVE[p]
    if (url) startLive(c, p, url, g)
  }
  scheduler()
  timers.push(setInterval(scheduler, 100), setInterval(retune, 30))
}

/** Move gains to match the dial. Runs often; cheap. */
function retune() {
  if (!ctx) return
  const s = radio.get()
  const band = bandById(s.band)
  const now = ctx.currentTime
  const on = s.power ? 1 : 0
  master.gain.setTargetAtTime(on * s.volume * s.volume * 1.2, now, 0.08)

  const heard = reception(band, s.tune)
  // Short-wave fades in and out on its own (QSB).
  const qsb = band.id === "SW" ? 0.75 + 0.25 * Math.sin(now * 0.7) * Math.sin(now * 0.23 + 1) : 1
  let best = { strength: 0, name: null as string | null, offset: 9, programme: null as Programme | null }
  const totals = new Map<Programme, number>()
  for (const h of heard) {
    const p = h.station.programme!
    h.strength *= liveFactor(p)
    totals.set(p, Math.max(totals.get(p) ?? 0, h.strength * qsb))
    if (h.strength > best.strength) best = { strength: h.strength, name: h.station.name, offset: h.offset, programme: p }
  }
  signal.programme = best.strength > 0.35 ? best.programme : null
  for (const [p, g] of programmeGain) g.gain.setTargetAtTime(totals.get(p) ?? 0, now, 0.04)
  // live streams: wanted by where the dial is, not by how well they've come in yet
  const nearLive = new Map<Programme, number>()
  for (const h of reception(band, s.tune)) nearLive.set(h.station.programme, Math.max(nearLive.get(h.station.programme) ?? 0, h.strength))
  tendLive(nearLive, s.power)
  const fm = band.kind === "fm"
  const hiss = fm ? Math.max(0, 1 - best.strength * 1.6) * 0.5 : (1 - best.strength * 0.85) * 0.35
  hissGain.gain.setTargetAtTime(hiss, now, 0.04)
  lowpass.frequency.setTargetAtTime(fm ? 9000 : 3800, now, 0.1)

  // Whistle only on AM, only near a carrier.
  const off = Math.abs(best.offset)
  const near = !fm && off > 0.12 && off < 2.2 ? Math.exp(-off) * 0.06 : 0
  whistle.frequency.setTargetAtTime(150 + off * 1400, now, 0.03)
  whistleGain.gain.setTargetAtTime(near, now, 0.03)

  weatherVolume = (totals.get("weather") ?? 0) * on * s.volume
  signal.strength = s.power ? best.strength * qsb : 0
  signal.station = best.strength > 0.35 ? best.name : null
  signal.hiss = s.power ? hiss : 0

  analyser.getFloatTimeDomainData(level)
  let sum = 0
  for (const v of level) sum += v * v
  signal.level = Math.sqrt(sum / level.length)

  if (weatherVolume > 0.08 && !speakingWeather) speakWeather()
}

// ---------------------------------------------------------------- programmes

let nextAt = new Map<Programme, number>()
let step = new Map<Programme, number>()

function scheduler() {
  if (!ctx) return
  const ahead = ctx.currentTime + 0.3
  for (const p of Object.keys(generators) as Programme[]) {
    let t = nextAt.get(p) ?? ctx.currentTime + 0.05
    while (t < ahead) {
      const i = step.get(p) ?? 0
      t += generators[p]!(ctx, programmeGain.get(p)!, t, i)
      step.set(p, i + 1)
    }
    nextAt.set(p, t)
  }
}

function tone(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; detune?: number } = {}) {
  const o = c.createOscillator()
  o.type = opts.type ?? "sine"
  o.frequency.value = f
  o.detune.value = opts.detune ?? 0
  const g = c.createGain()
  const peak = opts.gain ?? 0.2
  const a = opts.attack ?? 0.005
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}


// Each returns how long until it wants calling again.
type Generator = (c: AudioContext, out: AudioNode, t: number, i: number) => number

const morseText = "CQ CQ DE ZL1RT ZL1RT 36S 174E QRV K   "
const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", "0": "-----",
}
const morseSymbols = [...morseText].flatMap((ch) => (ch === " " ? ["  "] : [...(MORSE[ch] ?? ""), " "]))

// The radio's own programmes: Morse, the time pips, the forecast's carrier.
const generators: Partial<Record<Programme, Generator>> = {
  // Spoken by the browser's voice; here only a faint carrier hum.
  weather(c, out, t) {
    tone(c, out, t, 100, 2.1, { gain: 0.015, attack: 0.5 })
    return 2
  },
  morse(c, out, t, i) {
    const unit = 0.07
    const s = morseSymbols[i % morseSymbols.length]
    if (s === ".") tone(c, out, t, 640, unit, { gain: 0.18, attack: 0.004 })
    if (s === "-") tone(c, out, t, 640, unit * 3, { gain: 0.18, attack: 0.004 })
    return s === "." ? unit * 2 : s === "-" ? unit * 4 : s === " " ? unit * 2 : unit * 4
  },
  pips(c, out, t, i) {
    const long = i % 60 === 59
    tone(c, out, t, 1000, long ? 0.5 : 0.1, { gain: 0.2, attack: 0.003 })
    return 1
  },
}

// ---------------------------------------------------------------- weather (spoken)

const forecast = [
  "Here is the coastal forecast.",
  "Kaipara to Manukau. Southwest twenty knots, rising to thirty in the afternoon. Sea rough. Swell two metres.",
  "Cook Strait. Northerly thirty knots. Sea very rough. Visibility poor in showers.",
  "Hauraki Gulf. Variable ten knots. Sea slight. Fair.",
  "That is the end of the forecast.",
]
let forecastLine = 0

function speakWeather() {
  if (!("speechSynthesis" in window)) return
  speakingWeather = true
  const u = new SpeechSynthesisUtterance(forecast[forecastLine++ % forecast.length])
  u.rate = 0.9
  u.pitch = 0.8
  u.volume = Math.min(1, weatherVolume * 1.4)
  u.onend = u.onerror = () => {
    speakingWeather = false
  }
  speechSynthesis.speak(u)
}

export function stopWeatherIfFaded() {
  if (speakingWeather && weatherVolume < 0.05) speechSynthesis.cancel()
}
timers.push(setInterval(() => typeof window !== "undefined" && stopWeatherIfFaded(), 200))

/** Silences and tears down the whole engine. */
export function stopAudio() {
  timers.forEach(clearInterval)
  timers.length = 0
  for (const el of elements) {
    el.pause()
    el.removeAttribute("src")
    el.load()
  }
  elements.length = 0
  lives.clear()
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
  fireplace?.stop()
  fireplace = null
  paperSounds?.stop()
  paperSounds = null
  acoustics = null
  void ctx?.close()
  ctx = null
}

// In development, Vite swaps this module in place when it changes. Without
// this, the old engine (its records, its timers) keeps playing under the new
// one, and stations sound on top of each other.
if (import.meta.hot) import.meta.hot.dispose(stopAudio)

export const currentFreqLabel = () => {
  const s = radio.get()
  return freqAt(bandById(s.band), s.tune)
}

// for the test scripts: the engine's state, in development only
if (import.meta.env.DEV && typeof window !== "undefined")
  (window as unknown as { __radio: object }).__radio = { signal, lives, power: () => radio.get().power }
