// Asking the scene to bring the radio up (or put it down) from outside it:
// the portfolio menu does. The stage listens, and reports back through its
// onFocusChange as it always has.

const listeners = new Set<(on: boolean) => void>()

export const radioFocus = {
  request(on: boolean) {
    listeners.forEach((l) => l(on))
  },
  listen(l: (on: boolean) => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}
