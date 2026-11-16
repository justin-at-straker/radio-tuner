import { disc, grid, knob, quad, roundedBox, slab, type MeshData } from "./geometry"
import {
  identity,
  invert,
  rotateX,
  ortho,
  lookAt,
  mul,
  perspective,
  quatAxisAngle,
  quatMul,
  quatNormalize,
  quatSlerp,
  quatToMat,

  rotateY,
  rotateZ,
  scale,
  transformPoint,
  translate,
  type Mat4,
  type Quat,
} from "./math"
import { fragment, MODE, vertex } from "./shaders"
import { loadHdr, loadTexture } from "./assets"
import { createRoom, CUP, FLOOR, M, TYPEWRITER } from "./room"
import { CONTROLS, DIAL, KNOBS, LABEL, needleU, PX_PER_UNIT } from "@/ui/panels"
import { PAPER } from "@/ui/Newspaper"
import { PAGES_IN_VIEW, paperStore, SHEET_COUNT, VIEW_COUNT } from "@/ui/paperStore"
import { TYPE_PAGE } from "@/ui/Typewriter"
import { typewriterStore } from "@/ui/typewriterStore"
import { radioFocus } from "@/ui/radioFocus"
import { radio } from "@/radio/store"
import { setRadioCloseness, signal } from "@/radio/audio"

// The 3D radio. The HTML panels are children of the <canvas content="drawable">;
// each frame the browser hands us fresh pictures of them in the `paint` event,
// we texture them onto the cabinet, and then tell the browser exactly where
// each one ended up on screen (a full perspective matrix) so clicks, focus
// and the accessibility tree follow the drawing.

/* eslint-disable @typescript-eslint/no-explicit-any */
type HtmlCanvas = HTMLCanvasElement & {
  requestPaint(): void
  updateElementGeometry(el: Element, opts: { canvasTransform: DOMMatrix }): void
  clearElementGeometry?(el: Element): void
  getElementImageDefaultSize?(el: Element): { width: number; height: number }
}
type HtmlGl = WebGL2RenderingContext & {
  texElementSubImage2D(target: number, level: number, x: number, y: number, el: Element, config?: { width?: number; height?: number }): void
}

export function supportsHtmlInCanvas() {
  const c = document.createElement("canvas")
  c.setAttribute("content", "drawable")
  const gl = c.getContext("webgl2") as any
  return (c as any).content === "drawable" && !!gl && typeof gl.texElementSubImage2D === "function" && "requestPaint" in c
}

// ---------------------------------------------------------------- the cabinet's layout, in its own units

const CAB = { hx: 1.2, hy: 0.75, hz: 0.5, r: 0.12 }
const FRONT = CAB.hz + 0.003
const BACK = -CAB.hz - 0.003
const unit = (px: number) => px / PX_PER_UNIT
const TABLE_Y = -0.75
/** The teabag's tag (the GitHub link), in CSS px; and the cup it hangs from:
 *  rim height above the table and radius, tea level, in world units. */
const TAG = { w: 140, h: 110 }
const CUP_RIM = { y: 0.41, r: 0.27, tea: 0.31, teaR: 0.235 }
/** The sheets under the open page sit a little off true: [x, y] in page widths and heights. */
const STACK: [number, number][] = [
  [0.007, -0.005],
  [0.004, 0.008],
]
/** The inner sheets of the folded paper, fanned a little off true: [x, y] as above. */
const LEAVES: [number, number][] = [
  [0.011, 0.004],
  [0.005, -0.009],
  [0.014, -0.003],
]
const IDENTITY = identity()
/** The newspaper: folded on the front right of the table, or held up to read. */
const PAPER_AT: [number, number, number] = [1.55, TABLE_Y + 0.006, 2.35]
const PAPER_YAW = 0.22
const PAPER_SCALE = 0.65
/** Where it's held up to read, over the table, and how far back you sit to read it. */
const PAPER_READ: [number, number, number] = [0.25, 0, 3.25]
// Held up to read, the paper comes as close as it can while the print still
// fits the screen: only the bare margins may run off the edge. PAPER_PRINT is
// the printed area of a page (CSS px, inset from each edge); PAPER_SCREEN_GAP
// is what's kept clear on screen (CSS px), the bottom leaving room for the hints.
/** The sheet in the typewriter, in the model's own units: it rises from the
 *  top of the platen, leaning back a little and curling over at the top. */
const SHEET = { at: [0, 1.775, -1.464] as const, tilt: 0.3, w: 3.0, h: 2.6, curl: 0.3 }
/** The typewriter model sits this far below its own origin (its feet). */
const TYPEWRITER_FEET = 0.049
const PAPER_PRINT = { x: 24, top: 18, bottom: 14 }
const PAPER_SCREEN_GAP = { side: 14, top: 62, bottom: 54 } // the top clear of the menu
// turns the room so the fire is off to the right, lighting the radio from the side
const ENV_ROT = 0
const DIAL_AT = { x: -0.12, y: -0.14 }
const CONTROLS_AT = { x: 0, y: -0.52 }
const LABEL_AT = { x: -0.5, y: -0.32 }
const EYE_AT = { x: 0.91, y: -0.14, d: 0.2 }
const GRILLE = { x: 0, y: 0.33, w: 2.04, h: 0.56 }
const BACK_PANEL = { w: 2.1, h: 1.24 }
const knobAt = (k: { x: number; y: number }) => ({
  x: CONTROLS_AT.x - unit(CONTROLS.w) / 2 + unit(k.x),
  y: CONTROLS_AT.y + unit(CONTROLS.h) / 2 - unit(k.y),
})

/** Places the unit quad: centre, size, and whether it faces the back. */
const place = (x: number, y: number, z: number, w: number, h: number, back = false) =>
  mul(translate(x, y, z), back ? rotateY(Math.PI) : identity(), scale(w, h, 1))

interface Panel {
  el: HTMLElement
  css: { w: number; h: number }
  place: Mat4
  normalZ: 1 | -1
  mode: number
  tex: WebGLTexture
  allocated: string
  dirty: boolean
}

interface Mesh {
  vao: WebGLVertexArrayObject
  count: number
  indexType?: number
}

// ---------------------------------------------------------------- the scene: camera, table, poses

/** Where you sit: low over the coffee table, the room beyond. */
const EYE: [number, number, number] = [0.15, 0.0, 5.8]
const TARGET: [number, number, number] = [0.15, -0.32, 0]
/** The coffee table: an oval top, placed so its near edge runs off the bottom left. */
const TABLE_AT: [number, number, number] = [0.0, TABLE_Y, 1.3]
const TABLE_SIZE = { rx: 3.9, rz: 2.5, t: 0.14, er: 0.065 }
/** At rest the radio sits on the right of the table, turned a touch toward you. */
const REST_POS: [number, number, number] = [1.0, TABLE_Y + CAB.hy, 0.45]
const REST_Q: Quat = quatAxisAngle(0, 1, 0, -0.3)
/** Picked up, it's held well clear of the table (so turning it over can't
 *  clip the top) and the camera rises to meet it, face on. */
const HELD: [number, number, number] = [0.15, 0.85, 1.0]
const FOCUS_START: Quat = quatAxisAngle(1, 0, 0, 0.05)
const FOCUS_DIST = 3.4

export function createStage(
  canvas: HTMLCanvasElement,
  els: { dial: HTMLElement; controls: HTMLElement; label: HTMLElement; tag: HTMLElement; pages: HTMLElement[]; typewriter: HTMLElement },
  opts: { onFocusChange?: (focused: boolean) => void; onReady?: () => void } = {},
) {
  const cv = canvas as HtmlCanvas
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true }) as HtmlGl
  if (!gl) throw new Error("no webgl2")

  // ---- program
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader")
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link")
  gl.useProgram(prog)
  const U = new Proxy({} as Record<string, WebGLUniformLocation | null>, {
    get: (cache, name: string) => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(prog, name))),
  })

  const upload = (m: MeshData): Mesh => {
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const vb = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW)
    const ib = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24)
    gl.bindVertexArray(null)
    return { vao, count: m.index.length }
  }
  const cabinet = upload(roundedBox(CAB.hx, CAB.hy, CAB.hz, CAB.r))
  const quadMesh = upload(quad())
  const knobMesh = upload(knob(0.1, 0.075))
  const discMesh = upload(disc())
  const tableMesh = upload(slab(TABLE_SIZE.rx, TABLE_SIZE.rz, TABLE_SIZE.t, TABLE_SIZE.er))
  const legMesh = upload(roundedBox(0.16, 0.5, 0.16, 0.05, 6))
  const bagMesh = upload(roundedBox(0.085, 0.022, 0.1, 0.018, 6))

  // ---- the HTML panels
  const makePanel = (el: HTMLElement, css: { w: number; h: number }, at: { x: number; y: number }, back: boolean, mode: number): Panel => {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return {
      el,
      css,
      place: place(at.x, at.y, back ? BACK - 0.003 : FRONT, unit(css.w), unit(css.h), back),
      normalZ: back ? -1 : 1,
      mode,
      tex,
      allocated: "",
      dirty: true,
    }
  }
  const panels = [
    makePanel(els.dial, DIAL, DIAL_AT, false, MODE.dial),
    makePanel(els.controls, CONTROLS, CONTROLS_AT, false, MODE.controls),
    makePanel(els.label, LABEL, LABEL_AT, true, MODE.label),
  ]
  // the gift tag tied to the teapot: a link, placed in the room each frame
  const tag = makePanel(els.tag, TAG, { x: 0, y: 0 }, false, MODE.label)
  // the typewriter's sheet: its HTML page, on a sheet that curls back at the top
  const typePage = makePanel(els.typewriter, TYPE_PAGE, { x: 0, y: 0 }, false, MODE.label)
  const sheetMesh = upload(
    (() => {
      const m = grid(6, 18)
      for (let i = 0; i < m.data.length; i += 8) {
        const v = m.data[i + 1] + 0.5 // 0 at the platen, 1 at the top
        m.data[i + 2] = -SHEET.curl * v * v
        const slope = (2 * SHEET.curl * v) / SHEET.h
        const len = Math.hypot(slope, 1)
        m.data[i + 3] = 0
        m.data[i + 4] = slope / len
        m.data[i + 5] = 1 / len
      }
      return m
    })(),
  )
  let tf = 0 // 0 away .. 1 sat at the typewriter, eased
  // where the sheet is: the typewriter's own units -> the room (as the room draws it)
  const twK = TYPEWRITER.scale * M
  const twWorld = mul(translate(TYPEWRITER.x, TABLE_Y, TYPEWRITER.z), rotateY(TYPEWRITER.turn), translate(0, TYPEWRITER_FEET * twK, 0), scale(twK, twK, twK))
  const sheetPlace = mul(twWorld, translate(...SHEET.at), rotateX(-SHEET.tilt), translate(0, SHEET.h / 2, 0), scale(SHEET.w, SHEET.h, 1))
  const sheetSize = [SHEET.w * twK, SHEET.h * twK] as const
  // the camera's seat at the typewriter: square on to the middle of the sheet,
  // as near as fits it on screen
  const sheetCentre = transformPoint(sheetPlace, [0, 0, -SHEET.curl * 0.3]).slice(0, 3) as [number, number, number]
  const sheetNormal = (() => {
    const n = transformPoint(sheetPlace, [0, 0, 1])
    const o = transformPoint(sheetPlace, [0, 0, 0])
    const d = [n[0] - o[0], n[1] - o[1], n[2] - o[2]]
    const l = Math.hypot(...d)
    return d.map((v) => v / l) as [number, number, number]
  })()
  // the newspaper on the table (Justin's CV): four pages, picked up to read
  // and turned. Whether it's held and which page is open live in paperStore,
  // shared with the pages' own buttons.
  const pages = els.pages.map((el) => makePanel(el, PAPER, { x: 0, y: 0 }, false, MODE.label))
  const pageMesh = upload(grid())
  let pf = 0 // 0 on the table .. 1 held up to read, eased
  let shown = 0 // the view open, easing through turns (1.5 is the second sheet half turned)
  const paperHeld = () => paperStore.get().held

  // Pictures of the HTML at 2x for crispness when you lean in; falls back to
  // the browser's own size if this build won't take a size.
  let sizedUploads: boolean | null = null
  const takePicture = (p: Panel) => {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, p.tex)
    let w = p.css.w * 2
    let h = p.css.h * 2
    if (sizedUploads === false && cv.getElementImageDefaultSize) {
      const s = cv.getElementImageDefaultSize(p.el)
      w = Math.max(1, Math.ceil(s.width))
      h = Math.max(1, Math.ceil(s.height))
    }
    const key = `${w}x${h}`
    if (p.allocated !== key) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      p.allocated = key
    }
    try {
      if (sizedUploads === false) gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, p.el)
      else gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, p.el, { width: w, height: h })
      if (sizedUploads === null) sizedUploads = gl.getError() === gl.NO_ERROR
      if (sizedUploads === false) {
        p.allocated = ""
        return takePicture(p)
      }
    } catch (e) {
      if (sizedUploads === null && e instanceof TypeError) {
        sizedUploads = false
        p.allocated = ""
        return takePicture(p)
      }
      throw e
    }
    gl.generateMipmap(gl.TEXTURE_2D)
    p.dirty = false
  }

  // ---- two ways to be: resting on the table, or picked up into the middle
  // of the view. Click the radio to pick it up; click the room
  // (or Escape) to put it down. Only when it's picked up does dragging turn it.
  let q: Quat = FOCUS_START
  // After a fling it coasts: an axis and a speed in radians per second.
  let spin = { axis: [0, 1, 0] as [number, number, number], speed: 0 }
  let focusDist = FOCUS_DIST
  let focused = false
  let f = 0 // 0 resting .. 1 picked up, eased
  let drag: { x: number; y: number; roll: boolean; t: number } | null = null
  let lastModel = identity()
  let lastViewProj = identity()

  const setFocused = (next: boolean) => {
    if (next === focused) return
    focused = next
    spin.speed = 0
    opts.onFocusChange?.(focused)
  }

  /** Does a ray through this client point hit the cabinet? */
  const hitsRadio = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect()
    const nx = ((clientX - r.left) / r.width) * 2 - 1
    const ny = 1 - ((clientY - r.top) / r.height) * 2
    const toLocal = mul(invert(lastModel), invert(lastViewProj))
    const a = transformPoint(toLocal, [nx, ny, -1])
    const b = transformPoint(toLocal, [nx, ny, 1])
    const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]
    const p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]]
    const half = [CAB.hx, CAB.hy, CAB.hz + 0.09]
    let t0 = 0
    let t1 = 1
    for (let i = 0; i < 3; i++) {
      const d = p1[i] - p0[i]
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(p0[i]) > half[i]) return false
        continue
      }
      let ta = (-half[i] - p0[i]) / d
      let tb = (half[i] - p0[i]) / d
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) return false
    }
    return true
  }

  // The cursor says what you can do: a hand over the radio once it's picked
  // up (you can turn it), a pointer over it while it rests (click to
  // pick it up), the plain arrow everywhere else. The controls set their own.
  const setCursor = (c: string) => {
    if (canvas.style.cursor !== c) canvas.style.cursor = c
  }
  const hoverCursor = (e: PointerEvent) => {
    if (drag) return setCursor("grabbing")
    if (e.target !== canvas || paperHeld()) return setCursor("")
    const over = hitsRadio(e.clientX, e.clientY)
    setCursor(over ? (focused ? "grab" : "pointer") : "")
  }
  const onDown = (e: PointerEvent) => {
    // only the radio itself can be grabbed and turned
    if (e.target !== canvas || !focused || !hitsRadio(e.clientX, e.clientY)) return
    drag = { x: e.clientX, y: e.clientY, roll: e.shiftKey || e.button === 2, t: performance.now() }
    spin.speed = 0
    canvas.setPointerCapture(e.pointerId)
    setCursor("grabbing")
  }
  const onMove = (e: PointerEvent) => {
    hoverCursor(e)
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    const now = performance.now()
    const dt = Math.max(0.008, (now - drag.t) / 1000)
    drag.x = e.clientX
    drag.y = e.clientY
    drag.t = now
    const k = 0.008
    // drag right turns it right, drag down tips the top toward you; shift rolls
    const axis: [number, number, number] = drag.roll ? [0, 0, 1] : [dy, dx, 0]
    const angle = drag.roll ? -dx * k : Math.hypot(dx, dy) * k
    const len = Math.hypot(...axis)
    if (!len || !angle) return
    const a: [number, number, number] = [axis[0] / len, axis[1] / len, axis[2] / len]
    q = quatNormalize(quatMul(quatAxisAngle(a[0], a[1], a[2], angle), q))
    const speed = Math.min(8, angle / dt)
    spin = { axis: a, speed: spin.speed * 0.5 + speed * 0.5 }
  }
  const onUp = (e: PointerEvent) => {
    // a drag that stopped before letting go doesn't coast
    if (drag && performance.now() - drag.t > 60) spin.speed = 0
    drag = null
    hoverCursor(e)
  }
  const onWheel = (e: WheelEvent) => {
    if (e.target !== canvas || !focused) return
    e.preventDefault()
    focusDist = Math.min(5, Math.max(2.2, focusDist * Math.exp(e.deltaY * 0.001)))
  }
  // One click brings a thing into view (the radio's cabinet, the newspaper, the
  // typewriter's sheet) and one click anywhere else puts it down. A click that
  // ends a drag (turning the radio, selecting text) doesn't count, and clicks on
  // the radio's own controls work them rather than picking it up.
  let pressAt = { x: 0, y: 0 }
  const onPress = (e: PointerEvent) => (pressAt = { x: e.clientX, y: e.clientY })
  const onClickScene = (e: MouseEvent) => {
    if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 5) return
    const target = e.target instanceof Node ? e.target : null
    const within = (el: HTMLElement) => !!target && el.contains(target)
    if (within(els.tag)) return // the teabag's tag is a link
    const onPaper = els.pages.some(within)
    const onType = within(els.typewriter)
    const onPanel = [els.dial, els.controls, els.label].some(within)
    const onCabinet = e.target === canvas && hitsRadio(e.clientX, e.clientY)
    if (paperHeld()) {
      if (!onPaper) paperStore.set({ held: false })
      return
    }
    if (focused) {
      if (!onPanel && !onCabinet) setFocused(false)
      return
    }
    if (onPaper) {
      window.getSelection()?.removeAllRanges()
      return paperStore.set({ held: true })
    }
    if (onType) return typewriterStore.set({ open: true })
    if (onCabinet) return setFocused(true)
    if (onPanel) return
    // the room itself: get up from the typewriter
    if (typewriterStore.get().open) typewriterStore.set({ open: false })
  }
  const onKey = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea")
    if (paperHeld() && !typing && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      paperStore.set({ view: paperStore.get().view + (e.key === "ArrowRight" ? 1 : -1) })
      return
    }
    if (e.key === "Escape" && paperHeld()) paperStore.set({ held: false })
    else if (e.key === "Escape" && focused) setFocused(false)
    else if (e.key === "Escape" && typewriterStore.get().open) typewriterStore.set({ open: false })
  }
  window.addEventListener("keydown", onKey)
  const stopListening = radioFocus.listen((on) => setFocused(on))
  const noMenu = (e: Event) => e.target === canvas && e.preventDefault()
  canvas.addEventListener("pointerdown", onDown)
  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerup", onUp)
  canvas.addEventListener("pointercancel", onUp)
  canvas.addEventListener("wheel", onWheel, { passive: false })
  canvas.addEventListener("pointerdown", onPress, true)
  canvas.addEventListener("click", onClickScene)
  canvas.addEventListener("contextmenu", noMenu)

  // ---- the room's offscreen target (float if the GPU can render to it)
  const floatOk = !!gl.getExtension("EXT_color_buffer_float")
  const roomFormat = floatOk ? gl.RGBA16F : gl.RGBA8
  const roomType = floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE
  const roomTex = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE14)
  gl.bindTexture(gl.TEXTURE_2D, roomTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.activeTexture(gl.TEXTURE0)
  const roomFbo = gl.createFramebuffer()!
  const roomDepth = gl.createRenderbuffer()!

  // ---- the lamp's shadow map: depth seen from the lamp, compared in the shader
  const SHADOW_SIZE = 2048
  const shadowTex = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE15)
  gl.bindTexture(gl.TEXTURE_2D, shadowTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)
  gl.activeTexture(gl.TEXTURE0)
  const shadowFbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0)
  gl.drawBuffers([gl.NONE])
  gl.readBuffer(gl.NONE)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  let roomSize = ""

  // ---- size the drawing buffer to device pixels
  const ro = new ResizeObserver(([entry]) => {
    const dpc = entry.devicePixelContentBoxSize?.[0]
    canvas.width = dpc ? dpc.inlineSize : Math.round(entry.contentRect.width * devicePixelRatio)
    canvas.height = dpc ? dpc.blockSize : Math.round(entry.contentRect.height * devicePixelRatio)
    cv.requestPaint()
  })
  ro.observe(canvas, { box: "device-pixel-content-box" } as ResizeObserverOptions)

  // ---- frame
  let last = performance.now()
  let power = 0
  let level = 0
  const t0 = last

  const draw = (mesh: Mesh, model: Mat4, mode: number, extra?: () => void) => {
    gl.uniformMatrix4fv(U.uModel, false, model)
    gl.uniform1i(U.uMode, mode)
    extra?.()
    gl.bindVertexArray(mesh.vao)
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType ?? gl.UNSIGNED_INT, 0)
  }

  const frame = (changed: readonly Element[] | null) => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const s = radio.get()

    // motion: coast after a fling; glide between the table and the middle of the view
    if (!drag && spin.speed > 0.01) {
      const [x, y, z] = spin.axis
      q = quatNormalize(quatMul(quatAxisAngle(x, y, z, spin.speed * dt), q))
      spin.speed *= Math.exp(-dt * 3.5)
    }
    const fTarget = focused ? 1 : 0
    f += Math.sign(fTarget - f) * Math.min(Math.abs(fTarget - f), dt / 0.7)
    // once it's back down, the next pick-up starts facing you again
    if (!focused && f === 0) {
      q = FOCUS_START
      focusDist = FOCUS_DIST
    }
    // the newspaper: lifted or lying, and the page turning
    const ps = paperStore.get()
    // Put down open at a later page, it's closed first (a brisk turn back to
    // the front), and only then lowered to the table and folded
    const closing = !ps.held && shown > 0.001
    shown += Math.sign(ps.view - shown) * Math.min(Math.abs(ps.view - shown), dt / (closing ? 0.45 : 0.7))
    const lifted = ps.held || shown > 0.001 ? 1 : 0
    pf += Math.sign(lifted - pf) * Math.min(Math.abs(lifted - pf), dt / 0.6)
    // sat at the typewriter: unless the paper or the radio has your attention
    // (the typist may have handed you either); then back to it after
    const twOpen = typewriterStore.get().open && !ps.held && pf < 0.05 && !focused && f < 0.05
    tf += Math.sign((twOpen ? 1 : 0) - tf) * Math.min(Math.abs((twOpen ? 1 : 0) - tf), dt / 0.7)
    const te = tf * tf * (3 - 2 * tf)
    const pe = pf * pf * (3 - 2 * pf)
    const paperW = unit(PAPER.w) * PAPER_SCALE
    const paperH = unit(PAPER.h) * PAPER_SCALE
    // held: upright over the table, its foot clear of the top, the camera
    // rising to meet it; open past the front page, centred on the spine
    // the camera follows what's open: the front page, the spread's spine, the back page
    // (0 the front page, 1 any spread, 2 the back page)
    const across = Math.min(1, shown) + Math.max(0, Math.min(1, shown - (VIEW_COUNT - 2)))
    // held just above the table, in front of the cup, so its bottom edge hides it
    const readAt: [number, number, number] = [PAPER_READ[0], TABLE_Y + paperH / 2 + 0.08, PAPER_READ[2]]
    const readLook: [number, number, number] = [readAt[0] - (paperW / 2) * across, readAt[1], readAt[2]]

    // valves warm up slowly and cool a little faster
    power += ((s.power ? 1 : 0) - power) * (1 - Math.exp(-dt * (s.power ? 1.6 : 3)))
    level += (signal.level * 4 - level) * (1 - Math.exp(-dt * 20))

    // take pictures of whatever HTML changed
    if (changed) for (const p of panels) if (changed.includes(p.el)) p.dirty = true
    for (const p of panels) if (p.dirty) takePicture(p)
    if (changed?.includes(tag.el)) tag.dirty = true
    if (tag.dirty) takePicture(tag)
    if (changed?.includes(typePage.el)) typePage.dirty = true
    if (typePage.dirty) takePicture(typePage)
    for (const p of pages) {
      if (changed?.includes(p.el)) p.dirty = true
      if (p.dirty) takePicture(p)
    }

    const W = canvas.clientWidth
    const H = canvas.clientHeight
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)

    // a fixed camera, low over the coffee table, like sitting on the sofa
    const proj = perspective((35 * Math.PI) / 180, W / H, 0.1, 80)
    // the radio's pose: resting on the table, or held up in the middle of the
    // view, gliding between the two along a little arc; the camera follows
    const e = f * f * (3 - 2 * f)
    // picked up and brought close, the radio sounds nearer: drier, more present
    setRadioCloseness(e)
    const lerp3 = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * e) as [number, number, number]
    const radioEye = lerp3(EYE, [HELD[0], HELD[1] + 0.1, HELD[2] + focusDist])
    const radioLook = lerp3(TARGET, HELD)
    const mixP = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * pe) as [number, number, number]
    // how near to hold the paper: one page, or the spread (two) as it opens
    const spreadness = Math.max(0, 1 - Math.abs(across - 1))
    const printW = unit(PAPER.w - 2 * PAPER_PRINT.x) * PAPER_SCALE * (1 + spreadness) + unit(2 * PAPER_PRINT.x) * PAPER_SCALE * spreadness
    const printH = unit(PAPER.h - PAPER_PRINT.top - PAPER_PRINT.bottom) * PAPER_SCALE
    const printMid = unit((PAPER_PRINT.bottom - PAPER_PRINT.top) / 2) * PAPER_SCALE // print centre above the page centre
    const tanY = Math.tan((35 * Math.PI) / 180 / 2)
    const roomH = (H - PAPER_SCREEN_GAP.top - PAPER_SCREEN_GAP.bottom) / H
    const roomW = (W - 2 * PAPER_SCREEN_GAP.side) / W
    const readDist = Math.max(printH / 2 / (tanY * roomH), printW / 2 / (tanY * (W / H) * roomW))
    // aim a touch below the print so it sits in the clear space above the hints
    const aimDrop = ((PAPER_SCREEN_GAP.bottom - PAPER_SCREEN_GAP.top) / 2 / (H / 2)) * readDist * tanY
    const readAim: [number, number, number] = [readLook[0], readLook[1] + printMid - aimDrop, readLook[2]]
    const eye0 = mixP(radioEye, [readAim[0], readAim[1], readAim[2] + readDist])
    const look0 = mixP(radioLook, readAim)
    const seatDist = Math.max(sheetSize[1] / 2 / (tanY * 0.84), sheetSize[0] / 2 / (tanY * (W / H) * 0.9))
    const seat = sheetCentre.map((v, i) => v + sheetNormal[i] * seatDist)
    const mixT = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * te) as [number, number, number]
    const eye = mixT(eye0, seat)
    const view = lookAt(eye, mixT(look0, sheetCentre))
    const rot = quatToMat(quatSlerp(REST_Q, q, e))
    const pos = lerp3(REST_POS, HELD)
    pos[1] += Math.sin(e * Math.PI) * 0.35
    const model = mul(translate(pos[0], pos[1], pos[2]), rot)
    let lowest = Infinity
    const footprint = [0, 0]
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const p = transformPoint(rot, [sx * (CAB.hx - CAB.r), sy * (CAB.hy - CAB.r), sz * (CAB.hz - CAB.r)])
          lowest = Math.min(lowest, p[1] - CAB.r)
          footprint[0] = Math.max(footprint[0], Math.abs(p[0]) + CAB.r)
          footprint[1] = Math.max(footprint[1], Math.abs(p[2]) + CAB.r)
        }
    const height = Math.max(0, pos[1] + lowest - TABLE_Y)
    lastModel = model
    lastViewProj = mul(proj, view)
    gl.uniformMatrix4fv(U.uProj, false, proj)
    gl.uniformMatrix4fv(U.uView, false, view)
    gl.uniform3f(U.uCam, eye[0], eye[1], eye[2])
    gl.uniformMatrix4fv(U.uInvViewProj, false, invert(mul(proj, view)))
    // contact shadows: the radio (its own footprint, turned with it) and the tea things
    const yaw = Math.atan2(rot[8], rot[10])
    const occ = [[pos[0], pos[2], CAB.hx, CAB.hz]]
    const occB = [[yaw, CAB.r, 2 * CAB.hy, height]]
    for (const o of room.tableOccluders()) {
      occ.push([o.x, o.z, o.hw, o.hd])
      occB.push([o.turn, o.round, o.h, 0])
    }
    while (occ.length < 4) {
      occ.push([0, 0, 0, 0])
      occB.push([0, 0, 0, 0])
    }
    gl.uniform4fv(U["uOcc[0]"], occ.flat())
    gl.uniform4fv(U["uOccB[0]"], occB.flat())
    void footprint
    gl.uniform1f(U.uAspect, W / H)
    gl.uniform1f(U.uRoomGain, 0.5)
    const key = [-0.85, 0.5, -0.05]
    const kl = Math.hypot(...key)
    gl.uniform3f(U.uKeyDir, key[0] / kl, key[1] / kl, key[2] / kl)
    // the lamp, top left, flickering a touch with the fire
    const flame = 0.92 + 0.08 * Math.sin(now / 90) * Math.sin(now / 37)
    gl.uniform3f(U.uKeyCol, 1.6 * flame, 1.15 * flame, 0.7 * flame)
    const glow = transformPoint(model, [DIAL_AT.x, DIAL_AT.y, CAB.hz + 0.25])
    gl.uniform3f(U.uGlowPos, glow[0], glow[1], glow[2])
    const front = transformPoint(rot, [0, 0, 1])
    gl.uniform3f(U.uFront, front[0], front[1], front[2])
    gl.uniform1f(U.uPower, power)
    gl.uniform1f(U.uTime, (now - t0) / 1000)
    gl.uniform1f(U.uLevel, Math.min(1, level) * power)
    gl.uniform1f(U.uStrength, signal.strength)
    // tearing only once you're really off-station
    gl.uniform1f(U.uHiss, Math.max(0, signal.hiss - 0.1) * 4)
    gl.uniform1f(U.uNeedle, needleU(s.tune))
    gl.uniform1i(U.uTex, 0)
    gl.activeTexture(gl.TEXTURE0)

    gl.uniformMatrix4fv(U.uCab, false, model)
    gl.uniformMatrix4fv(U.uCabInv, false, invert(model))
    gl.uniform1f(U.uEnvMaxLod, envMaxLod)
    gl.uniform1f(U.uEnvRot, ENV_ROT)
    gl.uniform1f(U.uEnvGain, 1.0)
    gl.uniform1f(U.uExposure, 1.1)
    if (!ready) return

    // the room's light sources (fire, oil lamp, candles, tree) light everything
    const t = (now - t0) / 1000
    const lights = room.lights(t)
    gl.uniform3fv(U["uLightPos[0]"], lights.flatMap((l) => l.pos))
    gl.uniform3fv(U["uLightCol[0]"], lights.flatMap((l) => l.col))

    // the room: drawn for real, depth-tested, into its own buffer at half size,
    // then blurred behind the plane of focus like a fast lens would
    const rw = Math.max(64, Math.round(canvas.width / 2))
    const rh = Math.max(36, Math.round(canvas.height / 2))
    if (roomSize !== rw + "x" + rh) {
      roomSize = rw + "x" + rh
      gl.activeTexture(gl.TEXTURE14)
      gl.bindTexture(gl.TEXTURE_2D, roomTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, roomFormat, rw, rh, 0, gl.RGBA, roomType, null)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindRenderbuffer(gl.RENDERBUFFER, roomDepth)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, rw, rh)
      gl.bindFramebuffer(gl.FRAMEBUFFER, roomFbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, roomTex, 0)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, roomDepth)
    }
    // the room texture can't be bound for sampling while it's being drawn into
    gl.activeTexture(gl.TEXTURE14)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, roomFbo)
    gl.viewport(0, 0, rw, rh)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.uniform1i(U.uLinearOut, 1)
    gl.uniform1f(U.uEnvGain, 0.18)
    gl.uniform3f(U.uKeyCol, 0, 0, 0)
    room.drawRoom(t)
    gl.uniform1i(U.uLinearOut, 0)
    gl.uniform1f(U.uEnvGain, 0.32)
    gl.uniform3f(U.uKeyCol, 3.0 * flame, 2.0 * flame, 1.1 * flame)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clearColor(0, 0, 0, 0)
    gl.depthMask(false)
    gl.uniform1i(U.uScreen, 1)
    gl.disable(gl.DEPTH_TEST)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.activeTexture(gl.TEXTURE14)
    gl.bindTexture(gl.TEXTURE_2D, roomTex)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(U.uRoomTex, 14)
    draw(quadMesh, identity(), MODE.roomBlur)
    gl.enable(gl.DEPTH_TEST)
    gl.uniform1i(U.uScreen, 0)
    gl.depthMask(true)
    gl.disable(gl.CULL_FACE)
    // the radio's own surfaces, for a given placement (the real one, or its
    // reflection in the tabletop)
    const drawRadio = (model: Mat4) => {
      gl.uniformMatrix4fv(U.uCab, false, model)
      gl.uniformMatrix4fv(U.uCabInv, false, invert(model))
      draw(cabinet, model, MODE.cabinet)
      gl.disable(gl.CULL_FACE)
      bindSet(...sets.linen)
      draw(quadMesh, mul(model, place(GRILLE.x, GRILLE.y, FRONT, GRILLE.w, GRILLE.h)), MODE.grille, () =>
        gl.uniform2f(U.uSize, GRILLE.w, GRILLE.h),
      )
      for (const y of [0.035, -0.33, 0.625])
        draw(quadMesh, mul(model, place(0, y, FRONT + 0.001, 2.06, 0.014)), MODE.brass)
      draw(discMesh, mul(model, translate(EYE_AT.x, EYE_AT.y, FRONT + 0.001), scale(EYE_AT.d, EYE_AT.d, 1)), MODE.eye)
      bindSet(...sets.ply)
      draw(quadMesh, mul(model, place(0, 0, BACK, BACK_PANEL.w, BACK_PANEL.h, true)), MODE.back, () =>
        gl.uniform2f(U.uSize, BACK_PANEL.w, BACK_PANEL.h),
      )
      bindSet(...sets.linen)
      for (const p of panels) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, p.tex)
        draw(quadMesh, mul(model, p.place), p.mode, () => gl.uniform2f(U.uSize, unit(p.css.w), unit(p.css.h)))
      }
      gl.enable(gl.CULL_FACE)
      const turn = (v: number) => -((v * 270 - 135) * Math.PI) / 180
      for (const [k, v] of [
        [KNOBS.volume, s.volume],
        [KNOBS.tuning, s.tune],
      ] as const) {
        const at = knobAt(k)
        draw(knobMesh, mul(model, translate(at.x, at.y, CAB.hz), rotateZ(turn(v))), MODE.knob)
      }
    }
    // The teabag in the cup: the bag steeping in the tea, its string over the
    // rim on your side, and its tag (the GitHub link) hanging outside the cup,
    // swaying a little in the warm air. Placed once per frame, then drawn by
    // every pass: the lamp's shadows, the reflection in the table, the room.
    const toEye = Math.atan2(eye[0] - CUP.x, eye[2] - CUP.z)
    const out: [number, number] = [Math.sin(toEye), Math.cos(toEye)]
    const cupAt = (d: number, y: number): [number, number, number] => [CUP.x + out[0] * d, TABLE_Y + y, CUP.z + out[1] * d]
    const bagAt = cupAt(-0.06, CUP_RIM.tea + 0.01)
    const lip = cupAt(CUP_RIM.r + 0.01, CUP_RIM.y + 0.012)
    const hang = cupAt(CUP_RIM.r + 0.045, CUP_RIM.y - 0.03)
    const swing = 0.04 * Math.sin(t * 0.9) + 0.015 * Math.sin(t * 2.3 + 1)
    const tagW = unit(TAG.w) * 0.85
    const tagH = unit(TAG.h) * 0.85
    tag.place = mul(translate(...hang), rotateY(toEye), rotateZ(swing), rotateX(-0.06), translate(0, -tagH / 2, 0), scale(tagW, tagH, 1))
    /** A length of cotton string between two points, as a thin quad. */
    const strand = (a: number[], b: number[], width = 0.009): Mat4 => {
      const d = b.map((v, i) => v - a[i])
      const len = Math.hypot(...d)
      const y = d.map((v) => v / len)
      // across the string, square to the line of sight
      const x = [y[1] * out[1], y[2] * out[0] - y[0] * out[1], -y[1] * out[0]]
      const xl = Math.hypot(...x) || 1
      return new Float32Array([
        (x[0] / xl) * width, (x[1] / xl) * width, (x[2] / xl) * width, 0,
        y[0] * len, y[1] * len, y[2] * len, 0,
        0, 0, 1, 0,
        (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1,
      ])
    }
    const strings = [strand(bagAt, lip), strand(lip, hang)]
    const tea = mul(translate(...cupAt(0, CUP_RIM.tea)), rotateX(-Math.PI / 2), scale(CUP_RIM.teaR * 2, CUP_RIM.teaR * 2, 1))
    const bag = mul(translate(...bagAt), rotateY(toEye + 0.5), rotateX(0.35))
    const tinted = (rgb: [number, number, number], rough: number) => () => gl.uniform4f(U.uTint, rgb[0], rgb[1], rgb[2], rough)
    /** Draws the tea, the bag, its string and tag, under a placement (identity, or the table's mirror). */
    const drawTag = (pre: Mat4, depthOnly = false) => {
      gl.disable(gl.CULL_FACE)
      if (!depthOnly) draw(discMesh, mul(pre, tea), MODE.tint, tinted([0.32, 0.16, 0.06], 0.08))
      draw(bagMesh, mul(pre, bag), MODE.tint, tinted([0.86, 0.8, 0.68], 0.9))
      for (const sm of strings) draw(quadMesh, mul(pre, sm), MODE.tint, tinted([0.95, 0.93, 0.88], 0.8))
      if (!depthOnly) {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.depthMask(false)
        bindSet(...sets.linen)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tag.tex)
      }
      const at = mul(pre, tag.place)
      gl.uniformMatrix4fv(U.uCab, false, at)
      draw(quadMesh, at, MODE.label, () => gl.uniform2f(U.uSize, tagW, tagH))
      if (!depthOnly) {
        gl.depthMask(true)
        gl.disable(gl.BLEND)
      }
      gl.enable(gl.CULL_FACE)
      gl.uniformMatrix4fv(U.uCab, false, model)
      gl.uniformMatrix4fv(U.uCabInv, false, invert(model))
    }

    /** The typewriter's sheet: its HTML page on the curled sheet, lifted toward
     *  plain print while you're sat reading it. */
    const drawTypeSheet = () => {
      gl.disable(gl.CULL_FACE)
      bindSet(...sets.linen)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, typePage.tex)
      gl.uniformMatrix4fv(U.uCab, false, sheetPlace)
      // thin typing paper: the fire behind it shows through, a little less
      // once you're sat close reading it
      draw(sheetMesh, sheetPlace, MODE.label, () => {
        gl.uniform2f(U.uSize, sheetSize[0], sheetSize[1])
        gl.uniform1f(U.uReadable, te * 0.85)
        gl.uniform1f(U.uSheer, 0.8)
        gl.uniform1f(U.uSeeThrough, 0.5 - 0.15 * te)
        gl.uniform2f(U.uViewport, canvas.width, canvas.height)
      })
      gl.uniform1f(U.uSheer, 0)
      gl.uniform1f(U.uSeeThrough, 0)
      gl.uniform1f(U.uReadable, 0)
      gl.enable(gl.CULL_FACE)
      gl.uniformMatrix4fv(U.uCab, false, model)
      gl.uniformMatrix4fv(U.uCabInv, false, invert(model))
    }

    // The newspaper's frame: pivoting on its bottom edge, so lifting it from
    // the table it rises up rather than swinging through the tabletop.
    const lerp = (a: number, b: number) => a + (b - a) * pe
    const restFoot: [number, number, number] = [
      PAPER_AT[0] + Math.sin(PAPER_YAW) * (paperH / 2),
      PAPER_AT[1],
      PAPER_AT[2] + Math.cos(PAPER_YAW) * (paperH / 2),
    ]
    const readFoot: [number, number, number] = [readAt[0], readAt[1] - paperH / 2, readAt[2]]
    const foot: [number, number, number] = [
      lerp(restFoot[0], readFoot[0]),
      lerp(restFoot[1], readFoot[1]) + Math.sin(pe * Math.PI) * 0.25,
      lerp(restFoot[2], readFoot[2]),
    ]
    const paperFrame = mul(translate(...foot), rotateY(lerp(PAPER_YAW, 0)), rotateX(lerp(-Math.PI / 2, 0)))
    // Lying down it's folded in half, the masthead up; it unfolds as it rises
    // (once it's clear of the table), and folds again as it's put down.
    const fold = 1 - Math.min(1, Math.max(0, (pe - 0.2) / 0.45))
    const foldE = fold * fold * (3 - 2 * fold)
    // about a millimetre of paper either side of the fold: the outer sheet's
    // radius, with each sheet inside it on a tighter one
    const FOLD_R = 0.0055
    // folded, its visible half sits where the whole paper would have
    const pagePlace = mul(paperFrame, translate(0, paperH / 2 - (paperH / 4) * foldE, 0), scale(paperW, paperH, 1))
    for (const p of pages) p.place = pagePlace
    /** Draws one sheet: its front page and, on the back, the next page; rolled
     *  `flip` radians about the spine (0 open, PI turned over), `z` its place
     *  in the stack, `at` any nudge off true. */
    const drawSheet = (pre: Mat4, sheet: number, flip: number, z: number, at: Mat4, depthOnly: boolean, foldR = FOLD_R) => {
      if (!depthOnly) {
        gl.activeTexture(gl.TEXTURE8)
        gl.bindTexture(gl.TEXTURE_2D, pages[sheet * 2 + 1].tex)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, pages[sheet * 2].tex)
      }
      const where = mul(pre, pagePlace, at)
      gl.uniformMatrix4fv(U.uCab, false, where)
      draw(pageMesh, where, MODE.label, () => {
        gl.uniform2f(U.uSize, paperW, paperH)
        gl.uniform1i(U.uPage, 1)
        gl.uniform1f(U.uFlip, flip)
        gl.uniform1f(U.uCurl, -1.1)
        gl.uniform1f(U.uPageZ, paperW)
        gl.uniform1f(U.uLeafZ, z * (1 - foldE))
        gl.uniform1f(U.uFold, foldE)
        gl.uniform1f(U.uPageH, paperH)
        gl.uniform1f(U.uFoldR, foldR)
        gl.uniform1f(U.uFoldLift, (FOLD_R + foldR) * foldE)
        gl.uniform1f(U.uReadable, pre === IDENTITY ? pe * 0.92 : 0)
        gl.uniform1f(U.uSheer, 1)
      })
      gl.uniform1f(U.uSheer, 0)
      gl.uniform1i(U.uPage, 0)
      gl.uniform1f(U.uLeafZ, 0)
      gl.uniform1f(U.uFold, 0)
      gl.uniform1f(U.uReadable, 0)
    }
    /** The paper as it stands: two sheets printed on both sides, the second
     *  sitting a touch off true under the first, closed at the spine. Lying on
     *  the table its open edge lifts a little, as folded newsprint never quite
     *  settles; held up, it bows softly. Turned sheets land on top, on the left. */
    // the inner sheets are a touch off true at their open edges, but joined to
    // the outer one along the fold: so each nudge pivots on the spine (x = -0.5)
    const sheetNudges = Array.from({ length: SHEET_COUNT }, (_, k) =>
      k === 0 ? IDENTITY : mul(translate(-0.5, 0, 0), scale(1 + STACK[(k - 1) % STACK.length][0], 1 + STACK[(k - 1) % STACK.length][1], 1), translate(0.5, 0, 0)),
    )
    const drawPaper = (pre: Mat4, depthOnly = false) => {
      gl.disable(gl.CULL_FACE)
      if (!depthOnly) bindSet(...sets.linen)
      const lift = (1 - pe) * 0.012 // folded, the open edge barely lifts
      // sheet k turns as the view passes it; each lies a little lower when folded
      const turns = Array.from({ length: SHEET_COUNT }, (_, k) => Math.max(lift * (1 - 0.2 * k), Math.max(0, Math.min(1, shown - k)) * Math.PI))
      gl.uniform1f(U.uBow, pe * 0.06)
      // held, the top flops back a little and sways with your breathing
      gl.uniform1f(U.uSag, pe * (0.05 + 0.012 * Math.sin(now * 0.0011)))
      // folded on the table it has some thickness: the inner sheets fan out a
      // touch at the open edges (they're blank to us; only their edges show)
      if (foldE > 0.5) {
        for (const [i, [nx, ny]] of LEAVES.entries()) {
          const leaf = mul(translate(-0.5, 0, 0), scale(1 + nx, 1 + ny, 1), translate(0.5, 0, 0))
          drawSheet(pre, SHEET_COUNT - 1, lift * (0.5 - i * 0.12), 0, leaf, depthOnly, FOLD_R - 0.0013 * SHEET_COUNT - i * 0.0006)
        }
      }
      // innermost first: unturned sheets sit deeper on the right; turned ones
      // land on the left, the latest turned on top
      for (let k = SHEET_COUNT - 1; k >= 0; k--) {
        const turned = turns[k] > Math.PI / 2
        drawSheet(pre, k, turns[k], turned ? 0.002 + 0.004 * k : -0.003 * k, sheetNudges[k], depthOnly, FOLD_R - 0.0013 * k)
      }
      gl.uniform1f(U.uBow, 0)
      gl.uniform1f(U.uSag, 0)
      gl.enable(gl.CULL_FACE)
      gl.uniformMatrix4fv(U.uCab, false, model)
      gl.uniformMatrix4fv(U.uCabInv, false, invert(model))
    }

    // The lamp's shadows: draw the radio and the tea things as depth only,
    // seen from the lamp, over the whole space the radio can move through.
    const keyN = [key[0] / kl, key[1] / kl, key[2] / kl]
    const centre: [number, number, number] = [0.3, -0.2, 0.7]
    const lightView = lookAt([centre[0] + keyN[0] * 20, centre[1] + keyN[1] * 20, centre[2] + keyN[2] * 20], centre)
    const lightProj = ortho(-6.5, 6.5, -6.5, 6.5, 5, 40)
    const lightVP = mul(lightProj, lightView)
    gl.activeTexture(gl.TEXTURE15)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo)
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.POLYGON_OFFSET_FILL)
    gl.polygonOffset(2, 4)
    gl.uniform1i(U.uDepthOnly, 1)
    gl.uniformMatrix4fv(U.uView, false, lightView)
    gl.uniformMatrix4fv(U.uProj, false, lightProj)
    drawRadio(model)
    room.drawTable(TABLE_Y)
    drawTag(identity(), true)
    drawPaper(IDENTITY, true)
    gl.uniform1i(U.uDepthOnly, 0)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.uniformMatrix4fv(U.uView, false, view)
    gl.uniformMatrix4fv(U.uProj, false, proj)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.activeTexture(gl.TEXTURE15)
    gl.bindTexture(gl.TEXTURE_2D, shadowTex)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(U.uShadowMap, 15)
    gl.uniformMatrix4fv(U.uLightVP, false, lightVP)
    gl.uniform1f(U.uShadowTexel, 1 / SHADOW_SIZE)

    // The polished tabletop reflects what stands on it. Mirror the radio and
    // the tea things below the table's plane, then lay the table over them,
    // see-through in proportion to its gloss (Fresnel: more at a low angle).
    const mirror = mul(translate(0, TABLE_Y, 0), scale(1, -1, 1), translate(0, -TABLE_Y, 0))
    gl.disable(gl.CULL_FACE)
    gl.depthMask(false)
    draw(tableMesh, translate(...TABLE_AT), MODE.black)
    gl.depthMask(true)
    gl.frontFace(gl.CW)
    gl.uniform1i(U.uReflect, 1)
    gl.uniform1f(U.uReflectY, TABLE_Y)
    drawRadio(mul(mirror, model))
    room.drawTable(TABLE_Y, mirror)
    drawTag(mirror)
    drawPaper(mirror)
    gl.uniform1i(U.uReflect, 0)
    gl.frontFace(gl.CCW)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.disable(gl.CULL_FACE)
    bindSet(...sets.table)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    draw(tableMesh, translate(...TABLE_AT), MODE.table)
    gl.disable(gl.BLEND)
    const legH = TABLE_Y - TABLE_SIZE.t - FLOOR
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        draw(legMesh, mul(translate(TABLE_AT[0] + sx * TABLE_SIZE.rx * 0.62, FLOOR + legH / 2, TABLE_AT[2] + sz * TABLE_SIZE.rz * 0.58), scale(1, legH, 1)), MODE.table)
    room.drawTable(TABLE_Y)
    drawRadio(model)

    drawTag(identity())
    drawTypeSheet()
    // Held up to read, the paper is in front of everything: drawn last, over
    // whatever stands on the table. (Rising off the table, it's still among
    // them, so it doesn't pop in front of the cup on its way up.)
    if (pe > 0.5) gl.clear(gl.DEPTH_BUFFER_BIT)
    drawPaper(IDENTITY)

    // tell the browser where each panel is, so hit testing follows the drawing
    const vp = new Float32Array([W / 2, 0, 0, 0, 0, -H / 2, 0, 0, 0, 0, 1, 0, W / 2, H / 2, 0, 1])
    const toScreen = mul(vp, proj, view)
    for (const p of panels) {
      const facing = transformPoint(rot, [0, 0, p.normalZ])
      const centre = transformPoint(mul(model, p.place), [0, 0, 0])
      const toCam = [eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]]
      const visible = facing[0] * toCam[0] + facing[1] * toCam[1] + facing[2] * toCam[2] > 0.02
      if (!visible) {
        cv.clearElementGeometry?.(p.el)
        continue
      }
      // element CSS px -> unit quad -> cabinet -> world -> screen
      const fromElement = mul(translate(-0.5, 0.5, 0), scale(1 / p.css.w, -1 / p.css.h, 1))
      const m = mul(toScreen, model, p.place, fromElement)
      cv.updateElementGeometry(p.el, { canvasTransform: DOMMatrix.fromFloat32Array(m) })
    }
    // ...and the tag, which lives in the room rather than on the radio
    const tagFrom = mul(translate(-0.5, 0.5, 0), scale(1 / TAG.w, -1 / TAG.h, 1))
    cv.updateElementGeometry(tag.el, { canvasTransform: DOMMatrix.fromFloat32Array(mul(toScreen, tag.place, tagFrom)) })
    // the typewriter's sheet (flat for hit testing: its curl is slight); out of
    // reach while the paper or the radio is in your hands
    if (ps.held || pf > 0.05 || focused) cv.clearElementGeometry?.(typePage.el)
    else {
      const sheetFrom = mul(translate(-0.5, 0.5, 0), scale(1 / TYPE_PAGE.w, -1 / TYPE_PAGE.h, 1))
      cv.updateElementGeometry(typePage.el, { canvasTransform: DOMMatrix.fromFloat32Array(mul(toScreen, sheetPlace, sheetFrom)) })
    }
    // only the open pages are where you can click; the rest are out of reach.
    // A right-hand page lies where the sheet does; a left-hand page is the back
    // of a turned sheet, one page width to the left.
    const paperFrom = mul(translate(-0.5, 0.5, 0), scale(1 / PAPER.w, -1 / PAPER.h, 1))
    const settled = Math.abs(shown - ps.view) < 0.02
    const openPages = ps.held ? PAGES_IN_VIEW[ps.view] : [0]
    pages.forEach((p, i) => {
      if (!settled || !openPages.includes(i)) return cv.clearElementGeometry?.(p.el)
      const sheetAt = sheetNudges[Math.floor(i / 2)]
      const side = i % 2 === 1 ? translate(-1, 0, 0) : IDENTITY
      // folded on the table, only the top half of the front page is showing
      const folded = !ps.held ? mul(translate(0, 0.25, 0), scale(1, 0.5, 1)) : IDENTITY
      cv.updateElementGeometry(p.el, { canvasTransform: DOMMatrix.fromFloat32Array(mul(toScreen, pagePlace, sheetAt, side, folded, paperFrom)) })
    })
  }

  // the scanned materials and the HDRI; draw nothing until they're in
  let ready = false
  let envMaxLod = 0
  // The GPU has 16 texture units, so only the rosewood (everywhere on the
  // cabinet) keeps its own; every other material shares units 5 to 7 and is
  // bound just before it's drawn.
  const loadSet = async (name: string) =>
    Promise.all([
      loadTexture(gl, "/tex/" + name + "_diff.jpg", true),
      loadTexture(gl, "/tex/" + name + "_nor_gl.jpg", false),
      loadTexture(gl, "/tex/" + name + "_rough.jpg", false),
    ])
  const sets: Record<string, WebGLTexture[]> = {}
  const bindSet = (...texs: (WebGLTexture | null)[]) => {
    texs.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE5 + i)
      gl.bindTexture(gl.TEXTURE_2D, t)
    })
    gl.activeTexture(gl.TEXTURE0)
  }
  const room = createRoom({ gl, U, upload, draw, bindSet: (d, n, r) => bindSet(d, n, r) })
  let disposed = false
  void Promise.all([
    loadHdr(gl, "/tex/fireplace_2k.hdr"),
    loadSet("rosewood"),
    loadSet("linen").then((t) => (sets.linen = t)),
    loadSet("plywood").then((t) => (sets.ply = t)),
    loadSet("table").then((t) => (sets.table = t)),
    room.ready,
    loadTexture(gl, "/tex/paper_fibre_diff.jpg", true),
    loadTexture(gl, "/tex/paper_fibre_nor_gl.jpg", false),
    loadTexture(gl, "/tex/paper_crease_nor_gl.jpg", false),
  ]).then(([envTex, wood, , , , , paperD, paperN, creaseN]) => {
    if (disposed) return
    gl.useProgram(prog)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, envTex.tex)
    gl.uniform1i(U.uEnv, 1)
    gl.uniform1i(U.uShadowMap, 15)
    gl.uniform1i(U.uRoomTex, 14)
    envMaxLod = envTex.maxLod
    wood.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE2 + i)
      gl.bindTexture(gl.TEXTURE_2D, t)
    })
    ;[paperD, paperN, creaseN].forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE9 + i)
      gl.bindTexture(gl.TEXTURE_2D, t as WebGLTexture)
    })
    gl.uniform1i(U.uPaperD, 9)
    gl.uniform1i(U.uPaperN, 10)
    gl.uniform1i(U.uCreaseN, 11)
    gl.uniform1i(U.uTexBack, 8)
    gl.uniform1i(U.uWoodD, 2)
    gl.uniform1i(U.uWoodN, 3)
    gl.uniform1i(U.uWoodR, 4)
    for (const k of ["Mat"]) {
      gl.uniform1i(U["u" + k + "D"], 5)
      gl.uniform1i(U["u" + k + "N"], 6)
      gl.uniform1i(U["u" + k + "R"], 7)
    }
    gl.activeTexture(gl.TEXTURE0)
    ready = true
    opts.onReady?.()
  })

  const onPaint = (e: Event) => {
    frame((e as any).changedElements ?? null)
    cv.requestPaint()
  }
  canvas.addEventListener("paint", onPaint)
  cv.requestPaint()

  return () => {
    stopListening()
    disposed = true
    window.removeEventListener("keydown", onKey)
    canvas.removeEventListener("paint", onPaint)
    canvas.removeEventListener("pointerdown", onDown)
    canvas.removeEventListener("pointermove", onMove)
    canvas.removeEventListener("pointerup", onUp)
    canvas.removeEventListener("pointercancel", onUp)
    canvas.removeEventListener("wheel", onWheel)
    canvas.removeEventListener("pointerdown", onPress, true)
    canvas.removeEventListener("click", onClickScene)
    canvas.removeEventListener("contextmenu", noMenu)
    ro.disconnect()
  }
}

