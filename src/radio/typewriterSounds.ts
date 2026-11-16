// The typewriter, heard: real recordings of a typewriter (CC BY 4.0, Work With
// Sounds, see public/ambience/CREDITS.md) cut into twelve keystrokes, two space
// bars, the margin bell and the carriage return. Each keystroke is a clip
// picked at random and nudged in pitch and level, so a run of typing never
// repeats. Close and dry, like the newspaper: it's the room's sound, so it
// doesn't follow the radio's volume.

type Clip = "key" | "space" | "bell" | "return"

const FILES: Record<Clip, string[]> = {
  key: Array.from({ length: 12 }, (_, i) => `/ambience/typewriter/key-${i + 1}.opus`),
  space: ["/ambience/typewriter/space-1.opus", "/ambience/typewriter/space-2.opus"],
  bell: ["/ambience/typewriter/bell.opus"],
  return: ["/ambience/typewriter/return.opus"],
}

let ctx: AudioContext | null = null
let out: GainNode | null = null
const buffers: Partial<Record<Clip, AudioBuffer[]>> = {}
const last: Partial<Record<Clip, number>> = {}

export function startTypewriterSounds(c: AudioContext) {
  ctx = c
  out = c.createGain()
  out.gain.value = 0.35
  out.connect(c.destination)
  for (const [clip, urls] of Object.entries(FILES) as [Clip, string[]][])
    void Promise.all(
      urls.map((u) =>
        fetch(u)
          .then((r) => r.arrayBuffer())
          .then((d) => c.decodeAudioData(d))
          .catch(() => null),
      ),
    ).then((list) => (buffers[clip] = list.filter((b): b is AudioBuffer => b !== null)))
  return {
    stop() {
      out?.disconnect()
      ctx = null
      out = null
    },
  }
}

/** Plays one of the typewriter's sounds; quietly does nothing before the room's audio has started. */
export function typewriterSound(clip: Clip, level = 1) {
  const list = buffers[clip]
  if (!ctx || !out || !list?.length) return
  let i = Math.floor(Math.random() * list.length)
  if (i === last[clip] && list.length > 1) i = (i + 1) % list.length // never the same key twice running
  last[clip] = i
  const src = ctx.createBufferSource()
  src.buffer = list[i]
  if (clip === "key" || clip === "space") src.playbackRate.value = 0.95 + Math.random() * 0.1
  const g = ctx.createGain()
  g.gain.value = level * (clip === "key" ? 0.8 + Math.random() * 0.35 : 1)
  src.connect(g).connect(out)
  src.start()
}
