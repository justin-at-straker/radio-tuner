import music from "./music.json"
import { BANDS, bandById, freqAt, reception, type Programme } from "./stations"

const ALL_PROGRAMMES = [...new Set(BANDS.flatMap((b) => b.stations.map((s) => s.programme)))]
import { radio } from "./store"
import { startFireplace, type Fireplace } from "./fireplace"
import { createRoomAcoustics, type RoomAcoustics } from "./acoustics"

// Everything you hear is made here, live: no samples. Each programme is a
// small generator scheduled a little ahead of time; tuning only moves gains.
//
//   programmes -> per-programme gain ┐
//   hiss -> bandpass -> hiss gain    ├-> "valve" filter + soft clip -> volume -> analyser -> out
//   whistle (heterodyne) -> gain     ┘

let ctx: AudioContext | null = null
let fireplace: Fireplace | null = null
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

// ---------------------------------------------------------------- broadcasts
//
// The music stations play real recordings: public domain 78s from 1916 to 1925,
// via Wikimedia Commons (credits in public/music/CREDITS.md). Each station is
// "live": it plays all the time from a random point in its playlist, so tuning
// in lands you mid-song, and leaving doesn't pause it.

export interface Track {
  src: string
  title: string
  performer: string
  date: string
  label: string
  duration: number
}
const playlists = music as Partial<Record<Programme, Track[]>>
export const nowPlaying = new Map<Programme, Track>()

function startBroadcast(c: AudioContext, p: Programme, list: Track[], out: AudioNode) {
  const el = new Audio()
  elements.push(el)
  el.preload = "auto"
  c.createMediaElementSource(el).connect(out)
  let i = Math.floor(Math.random() * list.length)
  const play = (from: number) => {
    const track = list[i]
    el.src = track.src
    nowPlaying.set(p, track)
    el.addEventListener("loadedmetadata", () => (el.currentTime = from * el.duration), { once: true })
    void el.play().catch(() => {})
  }
  el.addEventListener("ended", () => {
    i = (i + 1) % list.length
    // a breath of dead air between records
    setTimeout(() => play(0), 1800)
  })
  play(0.05 + Math.random() * 0.6)
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
    const list = playlists[p]
    if (list?.length) startBroadcast(c, p, list, g)
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
    totals.set(p, Math.max(totals.get(p) ?? 0, h.strength * qsb))
    if (h.strength > best.strength) best = { strength: h.strength, name: h.station.name, offset: h.offset, programme: p }
  }
  signal.programme = best.strength > 0.35 ? best.programme : null
  for (const [p, g] of programmeGain) g.gain.setTargetAtTime(totals.get(p) ?? 0, now, 0.04)
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

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
let nextAt = new Map<Programme, number>()
let step = new Map<Programme, number>()

function scheduler() {
  if (!ctx) return
  const ahead = ctx.currentTime + 0.3
  for (const p of Object.keys(generators) as Programme[]) {
    if (playlists[p]?.length) continue // a real broadcast, not a synth
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

let noiseBuf: AudioBuffer | null = null
function hit(c: AudioContext, out: AudioNode, t: number, dur: number, freq: number, gain: number) {
  noiseBuf ??= noiseBuffer(c, 1)
  const n = c.createBufferSource()
  n.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = "bandpass"
  f.frequency.value = freq
  f.Q.value = 0.8
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  n.connect(f).connect(g).connect(out)
  n.start(t, Math.random() * 0.5)
  n.stop(t + dur + 0.05)
}

function kick(c: AudioContext, out: AudioNode, t: number, gain = 0.5) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.frequency.setValueAtTime(120, t)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.35)
}

// Each returns how long until it wants calling again.
type Generator = (c: AudioContext, out: AudioNode, t: number, i: number) => number

const jazzChords = [
  [62, 65, 69, 72], // Dm9-ish
  [55, 65, 67, 71], // G13
  [60, 64, 67, 71], // Cmaj7
  [57, 61, 64, 67], // A7
]
const morseText = "CQ CQ DE ZL1RT ZL1RT 36S 174E QRV K   "
const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", "0": "-----",
}
const morseSymbols = [...morseText].flatMap((ch) => (ch === " " ? ["  "] : [...(MORSE[ch] ?? ""), " "]))

// Synth programmes: the real radio sounds (Morse, pips, the forecast carrier),
// and a fallback for any music station whose records failed to download.
const generators: Partial<Record<Programme, Generator>> = {
  // Brushes, walking bass and soft electric-piano chords, swung.
  jazz(c, out, t, i) {
    const beat = 60 / 92
    const bar = Math.floor(i / 4) % jazzChords.length
    const chord = jazzChords[bar]
    if (i % 4 === 0) chord.forEach((n) => tone(c, out, t, midi(n), beat * 3.6, { gain: 0.05, attack: 0.02 }))
    if (i % 4 === 2) chord.slice(1).forEach((n) => tone(c, out, t + beat * 0.33, midi(n), beat * 1.2, { gain: 0.03 }))
    const walk = [0, 3, 5, 7][i % 4]
    tone(c, out, t, midi(chord[0] - 24 + walk), beat * 0.9, { type: "triangle", gain: 0.16 })
    hit(c, out, t, 0.18, 6000, 0.05)
    if (i % 2 === 1) hit(c, out, t + beat * 0.66, 0.08, 7000, 0.035)
    return beat
  },
  // A bouncy dance band: four-on-the-floor, offbeat chords, a little brass line.
  dance(c, out, t, i) {
    const beat = 60 / 124
    kick(c, out, t, 0.35)
    if (i % 2 === 1) hit(c, out, t, 0.12, 2200, 0.12)
    hit(c, out, t + beat / 2, 0.05, 8000, 0.04)
    const roots = [65, 70, 72, 65]
    const r = roots[Math.floor(i / 8) % 4]
    ;[r, r + 4, r + 7].forEach((n) => tone(c, out, t + beat / 2, midi(n), 0.18, { type: "square", gain: 0.022 }))
    tone(c, out, t, midi(r - 24), beat * 0.8, { type: "triangle", gain: 0.14 })
    const tune = [77, 0, 79, 81, 0, 77, 74, 0]
    const n = tune[i % 8]
    if (n) tone(c, out, t, midi(n), beat * 0.9, { type: "sawtooth", gain: 0.02, attack: 0.03 })
    return beat
  },
  // Long detuned string chords, slowly changing.
  orchestra(c, out, t, i) {
    const chords = [
      [48, 55, 64, 67, 72],
      [45, 52, 60, 64, 69],
      [41, 53, 57, 65, 72],
      [43, 50, 59, 62, 67],
    ]
    const dur = 4.2
    chords[i % 4].forEach((n, k) => {
      for (const d of [-7, 7]) tone(c, out, t, midi(n), dur + 1.4, { type: "sawtooth", gain: 0.012 - k * 0.001, attack: 1.4, detune: d })
    })
    return dur
  },
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
  lounge(c, out, t, i) {
    const beat = 60 / 76
    const chords = [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [50, 53, 57, 60],
      [52, 56, 59, 62],
    ]
    const ch = chords[Math.floor(i / 4) % 4]
    if (i % 4 === 0) ch.forEach((n) => tone(c, out, t, midi(n), beat * 4, { gain: 0.045, attack: 0.01 }))
    if (i % 4 === 0) tone(c, out, t, midi(ch[0] - 12), beat * 3, { type: "triangle", gain: 0.12 })
    if (i % 2 === 0) kick(c, out, t, 0.18)
    hit(c, out, t + beat / 2, 0.06, 9000, 0.025)
    const mel = [76, 74, 72, 74, 76, 79, 76, 72]
    if (i % 2 === 1) tone(c, out, t, midi(mel[(i >> 1) % 8]), beat * 1.5, { type: "triangle", gain: 0.05 })
    return beat
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
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
  fireplace?.stop()
  fireplace = null
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
