import { useSyncExternalStore } from "react"
import type { BandId } from "./stations"

// The radio's settings, shared by the HTML controls (React), the sound and
// the 3D scene. The scene reads it every frame without subscribing.
export interface RadioState {
  power: boolean
  band: BandId
  /** 0 to 1 across the dial. */
  tune: number
  /** 0 to 1. */
  volume: number
}

let state: RadioState = { power: false, band: "MW", tune: 0.296, volume: 0.6 }
const listeners = new Set<() => void>()

export const radio = {
  get: () => state,
  set(patch: Partial<RadioState>) {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export const useRadio = () => useSyncExternalStore(radio.subscribe, radio.get)
