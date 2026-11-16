// The living room's acoustics, for the radio: a short warm reverb from a
// synthesised impulse response (a few early reflections off the walls, then a
// soft decaying tail with the highs dying first, about 0.6 s, like a furnished
// lounge), and a little pan to the right, where the radio sits on the table.
//
// Closeness (0 on the table, 1 picked up and held in front of you) trades
// room for presence: nearer, it's drier, louder and centred.

export interface RoomAcoustics {
  /** 0 resting on the table across the room, 1 held up close. */
  setCloseness(x: number): void
}

const RT60 = 0.6 // seconds for the tail to fall 60 dB

function impulse(c: BaseAudioContext) {
  const length = Math.floor(c.sampleRate * (RT60 + 0.15))
  const ir = c.createBuffer(2, length, c.sampleRate)
  // early reflections: walls, table, ceiling, slightly different per ear
  const early = [
    [0.007, 0.5],
    [0.011, 0.35],
    [0.017, 0.3],
    [0.023, 0.22],
    [0.031, 0.18],
    [0.043, 0.12],
  ]
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    // the tail: decaying noise, low-passed more as it goes (soft furnishings)
    let lp = 0
    for (let i = 0; i < length; i++) {
      const t = i / c.sampleRate
      const amp = Math.exp((-6.9 * t) / RT60) * Math.min(1, t / 0.012)
      const k = 0.55 - 0.45 * Math.min(1, t / RT60)
      lp += k * (Math.random() * 2 - 1 - lp)
      d[i] = lp * amp * 0.45
    }
    for (const [at, gain] of early) {
      const i = Math.floor((at + ch * 0.0013 * Math.random()) * c.sampleRate)
      if (i < length) d[i] += gain * (ch ? 0.9 : 1)
    }
  }
  return ir
}

/** Routes the radio through the room, from `input` to the speakers. */
export function createRoomAcoustics(c: AudioContext, input: AudioNode): RoomAcoustics {
  const dry = c.createGain()
  const wet = c.createGain()
  const pan = c.createStereoPanner()
  const verb = c.createConvolver()
  verb.buffer = impulse(c)
  input.connect(dry).connect(pan)
  input.connect(verb).connect(wet).connect(pan)
  pan.connect(c.destination)

  const apply = (x: number, now: number) => {
    const t = 0.25
    dry.gain.setTargetAtTime(0.85 + 0.2 * x, now, t)
    wet.gain.setTargetAtTime(0.42 * (1 - x) + 0.08, now, t)
    pan.pan.setTargetAtTime(0.18 * (1 - x), now, t)
  }
  apply(0, c.currentTime)
  let last = 0
  return {
    setCloseness(x: number) {
      if (Math.abs(x - last) < 0.02) return
      last = x
      apply(x, c.currentTime)
    },
  }
}
