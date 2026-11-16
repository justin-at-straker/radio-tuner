// One program for everything; uMode picks the material. Lighting is
// physically based: image-based light from a studio HDRI, a key light, and
// the dial lamp, with a lacquer clear coat over the wood.
//
// The GLSL lives in radio.vert / radio.frag. Keep MODE in step with the
// `uMode ==` branches in radio.frag.

export { default as vertex } from "./radio.vert?raw"
export { default as fragment } from "./radio.frag?raw"

export const MODE = {
  cabinet: 0,
  knob: 1,
  brass: 2,
  grille: 3,
  back: 4,
  eye: 5,
  controls: 6,
  dial: 7,
  label: 8,
  room: 9,
  table: 10,
  roomBlur: 11,
  prop: 12,
  flame: 13,
  glass: 14,
  surface: 15,
  tree: 16,
  bauble: 17,
  bulb: 18,
  window: 19,
  fire: 20,
  black: 21,
} as const
