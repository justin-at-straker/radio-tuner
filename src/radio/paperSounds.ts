import { paperStore } from "@/ui/paperStore"

// The newspaper, heard: a page turning as you flick through it, and a softer
// rustle as you pick it up or put it down. Five real recordings of paper
// pages (public domain, see public/ambience/CREDITS.md), one picked at random
// each time and nudged in pitch and level, so no two turns sound the same.
// Close and dry: the paper is in your hands. It's the room's sound, not the
// radio's, so it doesn't follow the radio's volume.

export interface PaperSounds {
  stop(): void
}

const CLIPS = [1, 2, 3, 4, 5].map((n) => `/ambience/pages/turn-${n}.opus`)

export function startPaperSounds(c: AudioContext): PaperSounds {
  const out = c.createGain()
  out.gain.value = 0.3
  out.connect(c.destination)

  let buffers: AudioBuffer[] = []
  void Promise.all(
    CLIPS.map((url) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((d) => c.decodeAudioData(d))
        .catch(() => null),
    ),
  ).then((list) => (buffers = list.filter((b): b is AudioBuffer => b !== null)))

  let last = -1
  const play = (level: number) => {
    if (!buffers.length) return
    // never the same clip twice running
    let i = Math.floor(Math.random() * buffers.length)
    if (i === last && buffers.length > 1) i = (i + 1) % buffers.length
    last = i
    const src = c.createBufferSource()
    src.buffer = buffers[i]
    src.playbackRate.value = 0.94 + Math.random() * 0.12
    const g = c.createGain()
    g.gain.value = level * (0.85 + Math.random() * 0.3)
    src.connect(g).connect(out)
    src.start()
  }

  let prev = paperStore.get()
  const unsubscribe = paperStore.subscribe(() => {
    const next = paperStore.get()
    if (next.held !== prev.held) play(0.55) // picked up or put down: a softer rustle
    else if (next.view !== prev.view) play(1) // a sheet turned
    prev = next
  })

  return {
    stop() {
      unsubscribe()
      out.disconnect()
    },
  }
}
