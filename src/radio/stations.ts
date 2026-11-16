// The bands and what's on them. Every name printed on the dial is a real
// piece of HTML text, and every one of them is on air. The music is live
// radio: real stations, each one once, streamed while you're tuned near them
// (RNZ on its real Auckland frequencies, rnz.co.nz/listen). The forecast,
// the Morse and the time pips are the radio's own.

export type BandId = "MW" | "SW" | "FM"

export type Programme =
  // the radio's own
  | "weather" | "morse" | "pips"
  // live stations
  | "rnzNational" | "rnzConcert" | "twenties" | "jazz24" | "npoKlassiek" | "kpoa" | "opera" | "christmasVinyl" | "classicVinyl"

export interface Station {
  name: string
  /** Where it sits on the band, in the band's own unit. */
  freq: number
  /** What plays there. */
  programme: Programme
  /** A line for the listings card. */
  blurb?: string
}

/** The live stations, and where they stream from: HTTPS and CORS-open, so they
 *  go through the radio's valves and into the room like everything else.
 *  Each was checked in Chrome through Web Audio (scripts/live-probe.mjs). */
export const LIVE: Partial<Record<Programme, string>> = {
  rnzNational: "https://radionz.streamguys1.com/national/national/national/national-mainstream/chunks.m3u8",
  rnzConcert: "https://radionz.streamguys1.com/concert/concert/concert/concert-mainstream/chunks.m3u8",
  twenties: "https://streaming.positivity.radio/pr/1920/icecast.audio",
  jazz24: "https://knkx-live-a.edge.audiocdn.com/6285_128k",
  npoKlassiek: "https://icecast.omroep.nl/radio4-bb-mp3",
  kpoa: "https://pacificmedia.cdnstream1.com/2794_64.aac",
  opera: "https://live.radioclasic.com/listen/radio_clasic_opera/live.mp3",
  christmasVinyl: "https://icecast.walmradio.com:8443/christmas",
  classicVinyl: "https://icecast.walmradio.com:8443/classic",
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
      { name: "RNZ National", freq: 756, programme: "rnzNational", blurb: "Live from Auckland: news, talk and the day's stories" },
      { name: "Jazz24", freq: 880, programme: "jazz24", blurb: "Jazz24, Seattle: jazz around the clock" },
      { name: "Hilversum", freq: 1007, programme: "npoKlassiek", blurb: "NPO Klassiek, live from Hilversum" },
      { name: "The Twenties", freq: 1160, programme: "twenties", blurb: "Positively 1920's: dance bands and crooners" },
      { name: "Lahaina", freq: 1340, programme: "kpoa", blurb: "KPOA 93.5, Maui: Hawaiian music" },
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
      { name: "Bucharest", freq: 13.6, programme: "opera", blurb: "Clasic Radio Opera, Bucharest: arias all day" },
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
      { name: "RNZ Concert", freq: 92.6, programme: "rnzConcert", blurb: "Live: RNZ Concert, classical from the Sky Tower" },
      { name: "Christmas Vinyl", freq: 97.4, programme: "christmasVinyl", blurb: "Christmas Vinyl HD: carols and crooners, off the record" },
      { name: "Classic Vinyl", freq: 103.6, programme: "classicVinyl", blurb: "Classic Vinyl HD: standards from the 30s to the 60s" },
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
