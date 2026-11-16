// A small glTF 2.0 loader for Poly Haven's CC0 models: separate .gltf + .bin,
// triangle meshes with POSITION / NORMAL / TEXCOORD_0, node transforms, and
// PBR materials with diffuse, OpenGL normal and ARM (AO, roughness,
// metalness) textures. Glass and flames are flagged so the scene can treat
// them specially. Nothing more than these models need.

import { loadTexture, track } from "./assets"
import { identity, mul, scale, translate, type Mat4 } from "./math"

export type MaterialKind = "opaque" | "glass" | "flame"

export interface Material {
  name: string
  kind: MaterialKind
  diffuse: WebGLTexture | null
  normal: WebGLTexture | null
  arm: WebGLTexture | null
  tint: [number, number, number, number]
}

export interface Part {
  vao: WebGLVertexArrayObject
  count: number
  indexType: number
  /** The node's transform within the model, in metres. */
  matrix: Mat4
  material: Material
  name: string
}

export interface Model {
  name: string
  parts: Part[]
  /** Bounds of the whole model in its own metres. */
  min: [number, number, number]
  max: [number, number, number]
}

interface Gltf {
  nodes: { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[]
  scenes?: { nodes: number[] }[]
  scene?: number
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[]
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }[]
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]
  buffers: { uri: string }[]
  materials: {
    name: string
    alphaMode?: string
    pbrMetallicRoughness?: { baseColorTexture?: { index: number }; baseColorFactor?: number[]; metallicRoughnessTexture?: { index: number } }
    normalTexture?: { index: number }
  }[]
  textures?: { source: number }[]
  images?: { uri: string }[]
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

function trs(n: Gltf["nodes"][number]): Mat4 {
  if (n.matrix) return new Float32Array(n.matrix)
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const r = new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ])
  return mul(translate(tx, ty, tz), r, scale(sx, sy, sz))
}

export async function loadModel(gl: WebGL2RenderingContext, url: string): Promise<Model> {
  const base = url.slice(0, url.lastIndexOf("/") + 1)
  const g: Gltf = await track(fetch(url).then((r) => r.json()))
  const buffers = await Promise.all(g.buffers.map((b) => track(fetch(base + b.uri).then((r) => r.arrayBuffer()))))

  // textures, shared between materials, loaded once each
  const texCache = new Map<number, Promise<WebGLTexture>>()
  const tex = (index: number | undefined, srgb: boolean) => {
    if (index === undefined || !g.textures || !g.images) return Promise.resolve(null)
    const key = index * 2 + (srgb ? 1 : 0)
    if (!texCache.has(key)) texCache.set(key, loadTexture(gl, base + g.images[g.textures[index].source].uri, srgb))
    return texCache.get(key)!
  }
  const materials: Material[] = await Promise.all(
    g.materials.map(async (m) => {
      const pbr = m.pbrMetallicRoughness ?? {}
      const lower = m.name.toLowerCase()
      const kind: MaterialKind = lower.includes("flame") ? "flame" : lower.includes("glass") ? "glass" : "opaque"
      const f = pbr.baseColorFactor ?? [1, 1, 1, 1]
      return {
        name: m.name,
        kind,
        diffuse: await tex(pbr.baseColorTexture?.index, true),
        normal: await tex(m.normalTexture?.index, false),
        arm: await tex(pbr.metallicRoughnessTexture?.index, false),
        tint: [f[0], f[1], f[2], f[3]] as [number, number, number, number],
      }
    }),
  )

  const accessorData = (i: number) => {
    const a = g.accessors[i]
    const v = g.bufferViews[a.bufferView]
    const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const n = a.count * COMPONENTS[a.type]
    const buf = buffers[v.buffer]
    if (a.componentType === 5126) {
      // floats may be interleaved: copy out tightly if there's a stride
      const comps = COMPONENTS[a.type]
      if (v.byteStride && v.byteStride !== comps * 4) {
        const out = new Float32Array(n)
        const view = new DataView(buf)
        for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) out[k * comps + c] = view.getFloat32(offset + k * v.byteStride + c * 4, true)
        return out
      }
      return new Float32Array(buf, offset, n)
    }
    if (a.componentType === 5125) return new Uint32Array(buf, offset, n)
    if (a.componentType === 5123) return new Uint16Array(buf, offset, n)
    return new Uint8Array(buf, offset, n)
  }

  const parts: Part[] = []
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const visit = (ni: number, parent: Mat4) => {
    const n = g.nodes[ni]
    const m = mul(parent, trs(n))
    if (n.mesh !== undefined) {
      for (const p of g.meshes[n.mesh].primitives) {
        const vao = gl.createVertexArray()!
        gl.bindVertexArray(vao)
        const attr = (name: string, loc: number, size: number) => {
          const i = p.attributes[name]
          if (i === undefined) {
            gl.disableVertexAttribArray(loc)
            return
          }
          const b = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, b)
          gl.bufferData(gl.ARRAY_BUFFER, accessorData(i), gl.STATIC_DRAW)
          gl.enableVertexAttribArray(loc)
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
        }
        attr("POSITION", 0, 3)
        attr("NORMAL", 1, 3)
        attr("TEXCOORD_0", 2, 2)
        const idx = accessorData(p.indices!)
        const ib = gl.createBuffer()
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
        gl.bindVertexArray(null)
        const indexType = idx instanceof Uint32Array ? gl.UNSIGNED_INT : idx instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE
        parts.push({ vao, count: idx.length, indexType, matrix: m, material: materials[p.material ?? 0], name: n.name ?? "" })
        // bounds, through this node's transform
        const a = g.accessors[p.attributes.POSITION]
        if (a.min && a.max)
          for (const cx of [a.min[0], a.max[0]])
            for (const cy of [a.min[1], a.max[1]])
              for (const cz of [a.min[2], a.max[2]]) {
                const w = [m[0] * cx + m[4] * cy + m[8] * cz + m[12], m[1] * cx + m[5] * cy + m[9] * cz + m[13], m[2] * cx + m[6] * cy + m[10] * cz + m[14]]
                for (let k = 0; k < 3; k++) {
                  min[k] = Math.min(min[k], w[k])
                  max[k] = Math.max(max[k], w[k])
                }
              }
      }
    }
    for (const c of n.children ?? []) visit(c, m)
  }
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? g.nodes.map((_, i) => i)
  for (const r of roots) visit(r, identity())
  return { name: url, parts, min, max }
}
