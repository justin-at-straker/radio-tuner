import { disc, knob, quad, roundedBox, slab, type MeshData } from "./geometry"
import {
  identity,
  invert,
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
import { createRoom, FLOOR } from "./room"
import { CONTROLS, DIAL, KNOBS, LABEL, needleU, PX_PER_UNIT } from "@/ui/panels"
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
  els: { dial: HTMLElement; controls: HTMLElement; label: HTMLElement },
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
  // of the view. Double-click the radio to pick it up; double-click the room
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
  // up (you can turn it), a pointer over it while it rests (double-click to
  // pick it up), the plain arrow everywhere else. The controls set their own.
  const setCursor = (c: string) => {
    if (canvas.style.cursor !== c) canvas.style.cursor = c
  }
  const hoverCursor = (e: PointerEvent) => {
    if (drag) return setCursor("grabbing")
    if (e.target !== canvas) return setCursor("")
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
  const onDbl = (e: MouseEvent) => {
    // the panels are part of the radio, so a double-click on them counts too
    const onRadio = e.target !== canvas || hitsRadio(e.clientX, e.clientY)
    if (!focused && onRadio) setFocused(true)
    else if (focused && !onRadio) setFocused(false)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && focused) setFocused(false)
  }
  window.addEventListener("keydown", onKey)
  const noMenu = (e: Event) => e.target === canvas && e.preventDefault()
  canvas.addEventListener("pointerdown", onDown)
  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerup", onUp)
  canvas.addEventListener("pointercancel", onUp)
  canvas.addEventListener("wheel", onWheel, { passive: false })
  canvas.addEventListener("dblclick", onDbl)
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
    // valves warm up slowly and cool a little faster
    power += ((s.power ? 1 : 0) - power) * (1 - Math.exp(-dt * (s.power ? 1.6 : 3)))
    level += (signal.level * 4 - level) * (1 - Math.exp(-dt * 20))

    // take pictures of whatever HTML changed
    if (changed) for (const p of panels) if (changed.includes(p.el)) p.dirty = true
    for (const p of panels) if (p.dirty) takePicture(p)

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
    const eye = lerp3(EYE, [HELD[0], HELD[1] + 0.1, HELD[2] + focusDist])
    const view = lookAt(eye, lerp3(TARGET, HELD))
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
    gl.uniformMatrix4fv(U.uCab, false, model)
    gl.uniformMatrix4fv(U.uCabInv, false, invert(model))

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
  ]).then(([envTex, wood]) => {
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
    disposed = true
    window.removeEventListener("keydown", onKey)
    canvas.removeEventListener("paint", onPaint)
    canvas.removeEventListener("pointerdown", onDown)
    canvas.removeEventListener("pointermove", onMove)
    canvas.removeEventListener("pointerup", onUp)
    canvas.removeEventListener("pointercancel", onUp)
    canvas.removeEventListener("wheel", onWheel)
    canvas.removeEventListener("dblclick", onDbl)
    canvas.removeEventListener("contextmenu", noMenu)
    ro.disconnect()
  }
}

