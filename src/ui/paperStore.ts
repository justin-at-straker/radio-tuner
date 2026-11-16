import { useSyncExternalStore } from "react"

// The newspaper's state, shared by its pages (React: buttons, inert, the
// announcer) and the 3D scene (the stage: picking it up, turning sheets).
//
// Like a real paper it's printed on both sides of each sheet: sheet 1 carries
// pages 1 and 2, sheet 2 pages 3 and 4, sheet 3 pages 5 and 6. So what's in
// front of you is a view:
//   view 0: the front page (page 1)
//   view 1: the first spread inside (pages 2 and 3)
//   view 2: the middle spread (pages 4 and 5): the feature
//   view 3: the back page (page 6)

export const PAGE_COUNT = 6
export const SHEET_COUNT = PAGE_COUNT / 2
export const VIEW_COUNT = SHEET_COUNT + 1

/** The pages you can see in each view, left to right. */
export const PAGES_IN_VIEW: number[][] = [[0], [1, 2], [3, 4], [5]]

/** The view a page is seen in. */
export const viewOf = (page: number) => PAGES_IN_VIEW.findIndex((pages) => pages.includes(page))

export interface PaperState {
  /** Held up to read, or lying on the table. */
  held: boolean
  /** Which view is open (see above). */
  view: number
}

let state: PaperState = { held: false, view: 0 }
const listeners = new Set<() => void>()

export const paperStore = {
  get: () => state,
  set(patch: Partial<PaperState>) {
    const next = { ...state, ...patch }
    next.view = Math.max(0, Math.min(VIEW_COUNT - 1, next.view))
    // put down, the paper folds back to its front page
    if (!next.held) next.view = 0
    if (next.held === state.held && next.view === state.view) return
    state = next
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export const usePaper = () => useSyncExternalStore(paperStore.subscribe, paperStore.get)
