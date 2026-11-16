// The fire in the room, heard: a recording of a cosy indoor fireplace (see
// public/ambience/CREDITS.md), looped with a crossfade so there's no seam.
//
// It's the room's sound, not the radio's: it plays straight to the speakers
// (not through the radio's valve filter or volume knob), quietly, a little to
// the left where the fireplace is, and keeps going with the radio off.

export interface Fireplace {
  stop(): void
}

/** How loud the fire sits: a quiet bed under the radio. */
const LEVEL = 0.14
/** Each pass fades into the next over this many seconds. */
const XFADE = 3

export function startFireplace(c: BaseAudioContext): Fireplace {
  const out = c.createGain()
  out.gain.setValueAtTime(0, c.currentTime)
  out.gain.linearRampToValueAtTime(LEVEL, c.currentTime + 4) // the fire fades in
  const pan = c.createStereoPanner()
  pan.pan.value = -0.25
  out.connect(pan).connect(c.destination)

  let recording: AudioBuffer | null = null
  let nextStart = 0
  const playing: AudioBufferSourceNode[] = []
  void fetch("/ambience/fireplace.opus")
    .then((r) => r.arrayBuffer())
    .then((data) => c.decodeAudioData(data))
    .then((buffer) => {
      recording = buffer
      nextStart = c.currentTime + 0.05
      tick()
    })
    .catch(() => {})

  const play = (at: number, buffer: AudioBuffer) => {
    const src = c.createBufferSource()
    src.buffer = buffer
    const g = c.createGain()
    const end = at + buffer.duration
    // the first pass starts at full level (the whole fire fades in above);
    // every later pass fades in as the one before fades out
    g.gain.setValueAtTime(at === firstStart ? 1 : 0, at)
    g.gain.linearRampToValueAtTime(1, at + XFADE)
    g.gain.setValueAtTime(1, end - XFADE)
    g.gain.linearRampToValueAtTime(0, end)
    src.connect(g).connect(out)
    src.start(at)
    src.stop(end + 0.05)
    playing.push(src)
    src.onended = () => playing.splice(playing.indexOf(src), 1)
  }

  let firstStart = -1
  // keep the next pass queued a little ahead of time
  const tick = () => {
    if (!recording) return
    if (firstStart < 0) firstStart = nextStart
    while (nextStart < c.currentTime + 1) {
      play(nextStart, recording)
      nextStart += recording.duration - XFADE
    }
  }
  const timer = setInterval(tick, 500)

  return {
    stop() {
      clearInterval(timer)
      for (const src of playing) src.stop()
      out.disconnect()
    },
  }
}
