// The bands and what's on them. Every name printed on the dial is a real
// piece of HTML text, and every one of them is on air.

export type BandId = "MW" | "SW" | "FM"

export type Programme = "jazz" | "dance" | "orchestra" | "weather" | "morse" | "pips" | "lounge" | "christmas" | "hawaii" | "opera"

export interface Station {
  name: string
  /** Where it sits on the band, in the band's own unit. */
  freq: number
  /** What plays there. */
  programme: Programme
  /** A line for the listings card. */
  blurb?: string
}

export interface Band {
  id: BandId
  label: string
  unit: string
  min: number
  max: number
  /** Scale numbers printed along the row. */
  scale: number[]
  /** How far off a station you can be and still hear it, as a share of the band. */
  width: number
  /** AM bands hiss and fade; FM is clean but drops out hard. */
  kind: "am" | "fm"
  stations: Station[]
}

export const BANDS: Band[] = [
  {
    id: "MW",
    label: "MW",
    unit: "kHz",
    min: 530,
    max: 1610,
    scale: [550, 700, 850, 1000, 1150, 1300, 1450, 1600],
    width: 0.014,
    kind: "am",
    stations: [
      { name: "Wellington", freq: 560, programme: "weather", blurb: "Coastal forecast, read at dictation speed" },
      { name: "Christchurch", freq: 700, programme: "dance", blurb: "The dance band hour" },
      { name: "Auckland", freq: 850, programme: "jazz", blurb: "Night Jazz, with the lights down low" },
      { name: "Hilversum", freq: 1007, programme: "orchestra", blurb: "The evening concert" },
      { name: "Honolulu", freq: 1290, programme: "hawaii", blurb: "Steel guitars from the islands" },
    ],
  },
  {
    id: "SW",
    label: "SW",
    unit: "MHz",
    min: 5.9,
    max: 18,
    scale: [6, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 18],
    width: 0.008,
    kind: "am",
    stations: [
      { name: "Ship", freq: 7.03, programme: "morse", blurb: "A ship somewhere, keying its position in Morse" },
      { name: "Time", freq: 10.0, programme: "pips", blurb: "The time signal: a pip each second, a long one on the minute" },
      { name: "Rome", freq: 13.6, programme: "opera", blurb: "Opera from the great tenors" },
    ],
  },
  {
    id: "FM",
    label: "FM",
    unit: "MHz",
    min: 87.5,
    max: 108,
    scale: [88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108],
    width: 0.01,
    kind: "fm",
    stations: [
      { name: "Concert", freq: 91.8, programme: "orchestra", blurb: "Concert FM: the same strings, without the hiss" },
      { name: "Carols", freq: 97.4, programme: "christmas", blurb: "Carols for Christmas" },
      { name: "Lounge", freq: 103.6, programme: "lounge", blurb: "Piano rolls until late" },
    ],
  },
]

export const bandById = (id: BandId) => BANDS.find((b) => b.id === id)!

/** Tuning is a share of the dial, 0 to 1, the same for every band. */
export const freqAt = (band: Band, tune: number) => band.min + tune * (band.max - band.min)
export const tuneAt = (band: Band, freq: number) => (freq - band.min) / (band.max - band.min)

/** How strongly each programme on the band comes in at this tuning, 0 to 1. */
export function reception(band: Band, tune: number) {
  return band.stations
    .filter((s) => s.programme)
    .map((s) => {
      const d = (tune - tuneAt(band, s.freq)) / band.width
      // FM captures hard: a flat top that falls off a cliff.
      const strength = band.kind === "fm" ? 1 / (1 + Math.pow(d * d, 3)) : Math.exp(-d * d)
      return { station: s, strength, offset: d }
    })
}

export function formatFreq(band: Band, freq: number) {
  return band.unit === "kHz" ? `${Math.round(freq)} kHz` : `${freq.toFixed(band.id === "SW" ? 2 : 1)} MHz`
}
