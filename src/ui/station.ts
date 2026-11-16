import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"

// The radio's station selector, as a ui-sdk primitive, so people and agents
// tune by name rather than by a raw position on the dial.
//
// For a person, it's the dial glass: each printed station name is a button
// that tunes straight to it. For an agent (through the ui-sdk agent bridge),
// it's a component labelled "Station" whose items are every station on the
// set, named with what's on ("Carols: Carols for Christmas"), so
//   query({ within: "Station", text: "jazz" })
// finds Night Jazz, and
//   act({ steps: [{ ref: "Station", action: "setValue", args: ["Auckland"] }] })
// tunes to it, through the same change callback a click goes through.

export type StationItem = { value: string; label: string }

export type StationOptions = {
  /** The station tuned in now, by name, or "" between stations. */
  value?: string
  defaultValue?: string
  /** Every station on the set. */
  items?: StationItem[]
  /** What's playing on it right now, for an agent to read. */
  nowPlaying?: string
  onValueChange?: (value: string, details: ChangeDetails<"item-press" | "list-navigation">) => void
}

const station = definePrimitive({
  name: "station",
  options: {
    value: "string",
    defaultValue: "string",
    items: "value",
    nowPlaying: "string",
    onValueChange: "callback",
  },
  controlled: ["value", "nowPlaying"],
  state: (options: StationOptions) => ({
    value: options.value ?? options.defaultValue ?? "",
    items: options.items ?? [],
    nowPlaying: options.nowPlaying ?? "",
  }),
  sync: (options) => ({
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.items === undefined ? {} : { items: options.items }),
    ...(options.nowPlaying === undefined ? {} : { nowPlaying: options.nowPlaying }),
  }),
  api: (context) => {
    const change = createChange(context)
    const step = (by: number, event?: Event) => {
      const { items, value } = context.store.get()
      if (!items.length) return
      const i = items.findIndex((item) => item.value === value)
      const next = items[(i + by + items.length) % items.length] ?? items[0]
      change("value", next.value, { reason: "list-navigation", event })
    }
    return {
      /** Tune to a station, by name. */
      setValue: (value: string, event?: Event) => change("value", value, { reason: "item-press", event }),
      /** The next station along, wrapping round the bands. */
      next: (event?: Event) => step(1, event),
      /** The station before. */
      previous: (event?: Event) => step(-1, event),
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "group" }),
    }),
    item: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-pressed": String(part.key === state.value),
        "data-tuned": part.key === state.value ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.setValue(String(key), event),
    }),
  }),
  agent: { actions: ["setValue", "next", "previous"], closed: true },
})

export { station }
