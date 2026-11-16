import { useSyncExternalStore } from "react"

// The typewriter's state, shared by its page (React) and the 3D scene (the
// camera comes in to read it when it's open), and the agent bridge's
// permissions (a step that needs the person asks on the page).

export interface Confirmation {
  /** What the step would do, in the bridge's words (its data-agent-confirm). */
  text: string
  answer: (yes: boolean) => void
}

export interface TypewriterState {
  /** Sat at, the page brought up to read and type on. */
  open: boolean
  /** A step the typist wants to take that the visitor must agree to. */
  confirm: Confirmation | null
}

let state: TypewriterState = { open: false, confirm: null }
const listeners = new Set<() => void>()

export const typewriterStore = {
  get: () => state,
  set(patch: Partial<TypewriterState>) {
    const next = { ...state, ...patch }
    if (next.open === state.open && next.confirm === state.confirm) return
    state = next
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export const useTypewriter = () => useSyncExternalStore(typewriterStore.subscribe, typewriterStore.get)

/**
 * Asks the visitor, on the typewriter's page, whether a step may go ahead.
 * Resolves with their answer; a newer question, or the bridge giving up
 * (its signal), answers no.
 */
export function askOnThePage(text: string, signal?: AbortSignal): Promise<boolean> {
  state.confirm?.answer(false)
  return new Promise((resolve) => {
    const done = (yes: boolean) => {
      if (typewriterStore.get().confirm?.answer === done) typewriterStore.set({ confirm: null })
      resolve(yes)
    }
    signal?.addEventListener("abort", () => done(false), { once: true })
    typewriterStore.set({ confirm: { text, answer: done } })
  })
}
