// The living room the radio lives in: a winter's night, the fire lit, the
// tree up. Furniture and props are CC0 scans from Poly Haven (see
// public/models/CREDITS.md); the room shell, fireplace, fire, window and
// tree are built here. One unit is 20 cm (the radio is 2.4 units wide, about
// 48 cm), so the metre-scale models are scaled by 5.
//
// The room is drawn into its own buffer and blurred (it's behind the plane
// of focus); only the coffee table and what's on it are drawn sharp.

import { loadTexture } from "./assets"
import { quad, roundedBox, spheres, treeTier, type MeshData } from "./geometry"
import { loadModel, type Model, type Part } from "./gltf"
import { identity, mul, rotateX, rotateY, scale, translate, type Mat4 } from "./math"
import { MODE } from "./shaders"

export interface Mesh {
  vao: WebGLVertexArrayObject
  count: number
  indexType?: number
}

export interface RoomCtx {
  gl: WebGL2RenderingContext
  U: Record<string, WebGLUniformLocation | null>
  upload: (m: MeshData) => Mesh
  draw: (mesh: Mesh, model: Mat4, mode: number, extra?: () => void) => void
  /** Binds a diffuse / normal / ARM (or roughness) set to the shared material units. */
  bindSet: (d: WebGLTexture | null, n: WebGLTexture | null, r: WebGLTexture | null) => void
}

export const M = 5 // units per metre
export const FLOOR = -3.0 // the coffee table top is 45 cm off the floor
const BACK = -14
const LEFT = -14
const RIGHT = 14
const CEIL = FLOOR + 13

// where things are
const FIRE = { x: -2.5, w: 9, depth: 1.5 } // the chimney breast on the back wall
const OPEN = { w: 4.2, h: 3.4, y: 0.5 } // the firebox opening, from the hearth
const MANTEL_Y = FLOOR + 6
const WINDOW = { x: 8.2, y: FLOOR + 7.5, w: 5, h: 6.5 }
const TREE = { x: 6.6, z: -8.6, h: 10.5, r: 2.9 }
const TEAPOT = { x: -1.75, z: 0.05 }
const CUP = { x: -0.55, z: 1.35 }
const LAMP = { x: -8.6, z: -9.6 }

type Set = [WebGLTexture, WebGLTexture, WebGLTexture]

export function createRoom(ctx: RoomCtx) {
  const { gl, U, upload, draw, bindSet } = ctx
  const box = upload(roundedBox(0.5, 0.5, 0.5, 0.02, 4))
  const plane = upload(quad())
  const boxAt = (x: number, y: number, z: number, w: number, h: number, d: number) => mul(translate(x, y, z), scale(w, h, d))

  // ---- the Christmas tree: stacked tiers, baubles, a spiral of fairy lights
  const tiers: Mesh[] = []
  for (let k = 0; k < 7; k++) {
    const t = k / 7
    tiers.push(upload(treeTier(TREE.r * (1 - t * 0.78), TREE.h * 0.3, 96, 10, k)))
  }
  const rand = (i: number) => {
    const x = Math.sin(i * 91.345 + 7.13) * 47453.5453
    return x - Math.floor(x)
  }
  const onCone = (u: number, a: number, inset: number): [number, number, number] => {
    // a point on the tree's overall cone, u = 0 at the bottom, 1 at the top
    const r = TREE.r * (1 - u) * 0.92 - inset
    return [Math.cos(a) * r, 1.2 + u * (TREE.h - 1.4), Math.sin(a) * r]
  }
  const bulbPts: [number, number, number][] = []
  for (let i = 0; i < 180; i++) {
    const u = i / 180
    bulbPts.push(onCone(u * 0.95, u * Math.PI * 2 * 7 + rand(i) * 0.3, 0.05))
  }
  const baublePts: [number, number, number][] = []
  for (let i = 0; i < 26; i++) baublePts.push(onCone(0.08 + rand(i + 300) * 0.75, rand(i + 400) * Math.PI * 2, 0.15))
  const bulbs = upload(spheres(bulbPts, 0.06, 6))
  const baubles = upload(spheres(baublePts, baublePts.map((_, i) => 0.22 + rand(i + 500) * 0.12), 12))

  // ---- textures and models
  const sets: Record<string, Set> = {}
  const models: Record<string, Model> = {}
  const set = async (name: string) => {
    const [d, n, r] = await Promise.all([
      loadTexture(gl, `/tex/${name}_diff.jpg`, true),
      loadTexture(gl, `/tex/${name}_nor_gl.jpg`, false),
      loadTexture(gl, `/tex/${name}_arm.jpg`, false),
    ])
    sets[name] = [d, n, r]
  }
  const model = async (id: string) => {
    models[id] = await loadModel(gl, `/models/${id}/${id}.gltf`)
  }
  const ready = Promise.all([
    ...["floor", "wall", "stone", "rug"].map(set),
    ...["sofa_02", "throw_pillows_01", "tea_set_01", "mantel_clock_01", "brass_candleholders", "vintage_oil_lamp", "side_table_01", "wooden_bookshelf_worn", "fancy_picture_frame_01", "Rockingchair_01"].map(model),
  ])

  // ---- drawing helpers
  const surface = (s: string, model: Mat4, tile: number, tint: [number, number, number] = [1, 1, 1], emit: [number, number, number] = [0, 0, 0], mesh = box) => {
    bindSet(...sets[s])
    draw(mesh, model, MODE.surface, () => {
      gl.uniform1f(U.uTile, tile)
      gl.uniform4f(U.uTint, tint[0], tint[1], tint[2], 1)
      gl.uniform3f(U.uEmit, emit[0], emit[1], emit[2])
    })
  }
  /** Draws a model (or some of its parts) at a place, in metres scaled to units. */
  const drawModel = (id: string, place: Mat4, filter?: (p: Part) => boolean, pass: "opaque" | "glass" | "flame" = "opaque") => {
    const m = models[id]
    for (const p of m.parts) {
      if (filter && !filter(p)) continue
      if (p.material.kind !== pass) continue
      bindSet(p.material.diffuse, p.material.normal, p.material.arm)
      const mode = pass === "flame" ? MODE.flame : pass === "glass" ? MODE.glass : MODE.prop
      draw({ vao: p.vao, count: p.count, indexType: p.indexType }, mul(place, scale(M, M, M), p.matrix), mode, () => {
        const t = p.material.tint
        gl.uniform4f(U.uTint, t[0], t[1], t[2], t[3])
      })
    }
  }
  /** A model part re-centred on its own origin, so tea things can be placed one by one. */
  const drawPart = (id: string, name: string, place: Mat4) => {
    const p = models[id].parts.find((q) => q.name === name)
    if (!p) return
    const recentre = translate(-p.matrix[12], -p.matrix[13], -p.matrix[14])
    bindSet(p.material.diffuse, p.material.normal, p.material.arm)
    draw({ vao: p.vao, count: p.count, indexType: p.indexType }, mul(place, scale(M, M, M), recentre, p.matrix), MODE.prop, () => gl.uniform4f(U.uTint, 1, 1, 1, 1))
  }

  // placements
  const SOFA = mul(translate(-6.8, FLOOR, -5.2), rotateY(1.0))
  const SIDE = translate(LAMP.x, FLOOR, LAMP.z)
  const LAMP_AT = translate(LAMP.x, FLOOR + 0.45 * M, LAMP.z)
  const SHELF = translate(-11, FLOOR, BACK + 0.3 * M)
  const CHAIR = mul(translate(2.6, FLOOR, -8.6), rotateY(-0.5))
  const breastFront = BACK + FIRE.depth

  const drawShell = () => {
    // floor, walls, ceiling
    surface("floor", mul(translate(0, FLOOR, (BACK + 12) / 2), rotateX(-Math.PI / 2), scale(RIGHT - LEFT, 12 - BACK, 1)), 4, [0.8, 0.75, 0.7], [0, 0, 0], plane)
    surface("wall", mul(translate(0, (FLOOR + CEIL) / 2, BACK), scale(RIGHT - LEFT, CEIL - FLOOR, 1)), 6, [0.62, 0.5, 0.4], [0, 0, 0], plane)
    surface("wall", mul(translate(LEFT, (FLOOR + CEIL) / 2, (BACK + 12) / 2), rotateY(Math.PI / 2), scale(12 - BACK, CEIL - FLOOR, 1)), 6, [0.62, 0.5, 0.4], [0, 0, 0], plane)
    surface("wall", mul(translate(RIGHT, (FLOOR + CEIL) / 2, (BACK + 12) / 2), rotateY(-Math.PI / 2), scale(12 - BACK, CEIL - FLOOR, 1)), 6, [0.62, 0.5, 0.4], [0, 0, 0], plane)
    // a rug under the coffee table
    surface("rug", mul(translate(0.4, FLOOR + 0.02, 0.8), rotateX(-Math.PI / 2), scale(17, 11, 1)), 5, [0.9, 0.55, 0.5], [0, 0, 0], plane)

    // the chimney breast in stone, with the firebox opening cut out of it
    const fx = FIRE.x
    const zc = BACK + FIRE.depth / 2
    const side = (FIRE.w - OPEN.w) / 2
    const stone = (x: number, y: number, w: number, h: number) => surface("stone", boxAt(x, y, zc, w, h, FIRE.depth), 3.5, [0.72, 0.62, 0.55])
    stone(fx - OPEN.w / 2 - side / 2, FLOOR + (OPEN.y + OPEN.h) / 2, side, OPEN.y + OPEN.h)
    stone(fx + OPEN.w / 2 + side / 2, FLOOR + (OPEN.y + OPEN.h) / 2, side, OPEN.y + OPEN.h)
    stone(fx, FLOOR + OPEN.y / 2, OPEN.w, OPEN.y)
    stone(fx, (MANTEL_Y + FLOOR + OPEN.y + OPEN.h) / 2, FIRE.w, MANTEL_Y - (FLOOR + OPEN.y + OPEN.h))
    stone(fx, (MANTEL_Y + 0.4 + CEIL) / 2, FIRE.w - 0.6, CEIL - MANTEL_Y - 0.4)
    // the hearth, and the mantel shelf in dark wood
    surface("stone", boxAt(fx, FLOOR + 0.15, breastFront + 0.9, FIRE.w + 1, 0.3, 1.8), 3.5, [0.45, 0.4, 0.38])
    surface("floor", boxAt(fx, MANTEL_Y + 0.2, breastFront + 0.35, FIRE.w + 1.2, 0.4, FIRE.depth + 0.9), 2, [0.45, 0.33, 0.25])
    // the firebox: sooty inside, lit by embers
    const ember = (0.6 + 0.4 * flicker(time, 2)) * 1
    surface("stone", boxAt(fx, FLOOR + OPEN.y + OPEN.h / 2, BACK + 0.15, OPEN.w, OPEN.h, 0.3), 2, [0.18, 0.13, 0.11], [0.6 * ember, 0.18 * ember, 0.04 * ember])
    surface("stone", boxAt(fx, FLOOR + OPEN.y + 0.05, BACK + 0.8, OPEN.w, 0.1, 1.4), 2, [0.12, 0.09, 0.08], [0.9 * ember, 0.25 * ember, 0.05 * ember])
    // logs
    for (const [dx, a] of [[-0.6, 0.15], [0.6, -0.2]] as const)
      surface("floor", mul(translate(fx + dx, FLOOR + OPEN.y + 0.35, BACK + 0.8), rotateY(a), scale(2.6, 0.5, 0.5)), 1, [0.25, 0.15, 0.1], [0.5 * ember, 0.12 * ember, 0.02 * ember])

    // the window: night and snow outside, a dark frame, red curtains either side
    draw(plane, mul(translate(WINDOW.x, WINDOW.y, BACK + 0.03), scale(WINDOW.w, WINDOW.h, 1)), MODE.window)
    for (const [x, w] of [[WINDOW.x, WINDOW.w + 0.5], [WINDOW.x, 0.18]] as const) {
      surface("floor", boxAt(x, WINDOW.y + WINDOW.h / 2, BACK + 0.12, w, 0.25, 0.25), 2, [0.3, 0.22, 0.16])
      surface("floor", boxAt(x, WINDOW.y - WINDOW.h / 2, BACK + 0.15, w, 0.3, 0.35), 2, [0.3, 0.22, 0.16])
    }
    surface("floor", boxAt(WINDOW.x, WINDOW.y, BACK + 0.1, 0.16, WINDOW.h, 0.2), 2, [0.3, 0.22, 0.16])
    surface("floor", boxAt(WINDOW.x, WINDOW.y + WINDOW.h * 0.17, BACK + 0.1, WINDOW.w, 0.14, 0.2), 2, [0.3, 0.22, 0.16])
    for (const s of [-1, 1]) {
      const cx = WINDOW.x + s * (WINDOW.w / 2 + 1.1)
      surface("rug", mul(translate(cx, (FLOOR + WINDOW.y + WINDOW.h / 2 + 1.2) / 2, BACK + 0.35), scale(1.8, WINDOW.y + WINDOW.h / 2 + 1.2 - FLOOR, 1)), 2.5, [0.75, 0.25, 0.22], [0, 0, 0], plane)
    }
  }

  const drawFurniture = () => {
    drawModel("sofa_02", SOFA)
    drawModel("throw_pillows_01", mul(SOFA, translate(0, 0.42 * M + 0.26 * M * 0.6, -0.08 * M)))
    drawModel("side_table_01", SIDE)
    drawModel("vintage_oil_lamp", LAMP_AT)
    drawModel("wooden_bookshelf_worn", SHELF)
    drawModel("Rockingchair_01", CHAIR)
    drawModel("brass_candleholders", translate(FIRE.x - 0.4, MANTEL_Y + 0.4, breastFront + 0.3))
    drawModel("mantel_clock_01", translate(FIRE.x + 3.1, MANTEL_Y + 0.4, breastFront + 0.3))
    drawModel("fancy_picture_frame_01", translate(FIRE.x, MANTEL_Y + 3.2, breastFront + 0.05))
    // the tree: a basket, the tiers, baubles and lights
    surface("rug", boxAt(TREE.x, FLOOR + 0.6, TREE.z, 2.2, 1.2, 2.2), 1.5, [0.5, 0.35, 0.2])
    const treeAt = translate(TREE.x, FLOOR, TREE.z)
    for (let k = 0; k < tiers.length; k++) draw(tiers[k], mul(treeAt, translate(0, 1.2 + k * TREE.h * 0.125, 0), rotateY(k * 0.7)), MODE.tree)
    draw(baubles, treeAt, MODE.bauble)
    draw(bulbs, treeAt, MODE.bulb)
  }

  /** Glass and flames last, blended over everything else. */
  const drawGlow = () => {
    gl.enable(gl.BLEND)
    gl.depthMask(false)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    drawModel("vintage_oil_lamp", LAMP_AT, undefined, "glass")
    drawModel("mantel_clock_01", translate(FIRE.x + 3.1, MANTEL_Y + 0.4, breastFront + 0.3), undefined, "glass")
    gl.blendFunc(gl.ONE, gl.ONE)
    drawModel("vintage_oil_lamp", LAMP_AT, undefined, "flame")
    drawModel("brass_candleholders", translate(FIRE.x - 0.4, MANTEL_Y + 0.4, breastFront + 0.3), undefined, "flame")
    // the fire itself
    draw(plane, mul(translate(FIRE.x, FLOOR + OPEN.y + OPEN.h * 0.45, BACK + 0.9), scale(OPEN.w * 0.85, OPEN.h * 0.9, 1)), MODE.fire)
    draw(plane, mul(translate(FIRE.x + 0.3, FLOOR + OPEN.y + OPEN.h * 0.4, BACK + 1.0), rotateY(0.5), scale(OPEN.w * 0.6, OPEN.h * 0.8, 1)), MODE.fire)
    gl.depthMask(true)
    gl.disable(gl.BLEND)
  }

  let time = 0
  return {
    ready,
    /** The room, behind the plane of focus. */
    drawRoom(t: number) {
      time = t
      drawShell()
      drawFurniture()
      drawGlow()
    },
    /** The tea things on the coffee table: drawn sharp, with the radio. */
    drawTable(tableY: number, pre: Mat4 = identity()) {
      const at = (x: number, z: number, a: number) => mul(pre, translate(x, tableY, z), rotateY(a))
      drawPart("tea_set_01", "tea_set_01_teapot_01", at(TEAPOT.x, TEAPOT.z, 0.7))
      drawPart("tea_set_01", "tea_set_01_teapot_01_lid", mul(at(TEAPOT.x, TEAPOT.z, 0.7), translate(0, 0.002 * M, 0)))
      drawPart("tea_set_01", "tea_set_01_saucer_circular_03", at(CUP.x, CUP.z, 0))
      drawPart("tea_set_01", "tea_set_01_cup_small_01", mul(at(CUP.x, CUP.z, 0.9), translate(0, 0.012 * M, 0)))
    },
    /** Footprints of the tea things, for their contact shadows on the table. */
    tableOccluders() {
      return [
        { x: TEAPOT.x, z: TEAPOT.z, hw: 0.42, hd: 0.42, turn: 0, round: 0.42, h: 0.6 },
        { x: CUP.x, z: CUP.z, hw: 0.37, hd: 0.37, turn: 0, round: 0.37, h: 0.3 },
      ]
    },
    /** The room's light sources this instant: the fire, the oil lamp, candles, the tree. */
    lights(t: number): { pos: [number, number, number]; col: [number, number, number] }[] {
      const f = flicker(t, 0)
      const l = flicker(t * 1.3, 5)
      return [
        { pos: [FIRE.x, FLOOR + OPEN.y + 1.6, breastFront + 0.6], col: [9 * f, 3.4 * f, 0.9 * f] },
        { pos: [LAMP.x, FLOOR + 0.45 * M + 2.6, LAMP.z], col: [3.2 * l, 1.8 * l, 0.7 * l] },
        { pos: [FIRE.x - 0.4, MANTEL_Y + 2.4, breastFront + 0.6], col: [1.2 * l, 0.6 * l, 0.2 * l] },
        { pos: [TREE.x, FLOOR + TREE.h * 0.5, TREE.z + 1.5], col: [2.2, 1.5, 0.8] },
      ]
    },
  }
}

export function flicker(t: number, seed: number) {
  return 0.82 + 0.1 * Math.sin(t * 7.3 + seed) * Math.sin(t * 3.1 + seed * 2) + 0.08 * Math.sin(t * 17.0 + seed * 3)
}

export const ROOM_IDENTITY = identity()
