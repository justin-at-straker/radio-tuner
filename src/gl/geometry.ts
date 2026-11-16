// Meshes as interleaved arrays: position (3), normal (3), uv (2).

export interface MeshData {
  data: Float32Array
  index: Uint32Array
}

/** A box with rounded edges and corners: a subdivided cube pushed out to a
 *  rounded shell. Half extents hx, hy, hz; corner radius r. */
export function roundedBox(hx: number, hy: number, hz: number, r: number, n = 24): MeshData {
  const verts: number[] = []
  const index: number[] = []
  const faces: [number[], number[], number[]][] = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ]
  const h = [hx, hy, hz]
  const inner = h.map((v) => v - r)
  for (const [nrm, u, v] of faces) {
    const base = verts.length / 8
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 2 - 1
        const b = (j / n) * 2 - 1
        // Bunch samples toward the edges so the rounding stays smooth.
        const sa = Math.sign(a) * Math.pow(Math.abs(a), 0.6)
        const sb = Math.sign(b) * Math.pow(Math.abs(b), 0.6)
        const p = [0, 1, 2].map((k) => (nrm[k] + u[k] * sa + v[k] * sb) * h[k])
        const c = p.map((x, k) => Math.max(-inner[k], Math.min(inner[k], x)))
        const d = p.map((x, k) => x - c[k])
        const l = Math.hypot(...d) || 1
        const nn = d.map((x) => x / l)
        const pos = c.map((x, k) => x + nn[k] * r)
        verts.push(...pos, ...nn, i / n, j / n)
      }
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = base + j * (n + 1) + i
        index.push(k, k + 1, k + n + 2, k, k + n + 2, k + n + 1)
      }
  }
  return { data: new Float32Array(verts), index: new Uint32Array(index) }
}

/** A unit quad in the XY plane, facing +Z, from -0.5 to 0.5; uv (0,0) top-left. */
export function quad(): MeshData {
  return {
    data: new Float32Array([
      -0.5, 0.5, 0, 0, 0, 1, 0, 0,
      0.5, 0.5, 0, 0, 0, 1, 1, 0,
      0.5, -0.5, 0, 0, 0, 1, 1, 1,
      -0.5, -0.5, 0, 0, 0, 1, 0, 1,
    ]),
    index: new Uint32Array([0, 2, 1, 0, 3, 2]),
  }
}

/** A knob: a cylinder along +Z from 0 to depth, with a slight dome on top.
 *  uv.y is 0 on the side and 1 on the cap, uv.x the angle round. */
export function knob(radius: number, depth: number, seg = 64): MeshData {
  const v: number[] = []
  const idx: number[] = []
  // side
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    v.push(c * radius, s * radius, 0, c, s, 0, i / seg, 0)
    v.push(c * radius * 0.96, s * radius * 0.96, depth, c, s, 0.25, i / seg, 0)
  }
  for (let i = 0; i < seg; i++) {
    const k = i * 2
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
  }
  // domed cap: rings from the rim in to the centre
  const rings = 8
  const capBase = v.length / 8
  for (let r = 0; r <= rings; r++) {
    const t = r / rings
    const rr = radius * 0.96 * (1 - t)
    const z = depth + Math.sin(t * Math.PI * 0.5) * radius * 0.12
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      const nx = Math.cos(a) * (1 - t) * 0.35
      const ny = Math.sin(a) * (1 - t) * 0.35
      const l = Math.hypot(nx, ny, 1)
      v.push(Math.cos(a) * rr, Math.sin(a) * rr, z, nx / l, ny / l, 1 / l, i / seg, 1)
    }
  }
  for (let r = 0; r < rings; r++)
    for (let i = 0; i < seg; i++) {
      const k = capBase + r * (seg + 1) + i
      idx.push(k, k + 1, k + seg + 2, k, k + seg + 2, k + seg + 1)
    }
  return { data: new Float32Array(v), index: new Uint32Array(idx) }
}

/** A flat disc facing +Z, radius 0.5 at uv edge; uv centred on 0.5. */
export function disc(seg = 48): MeshData {
  const v: number[] = [0, 0, 0, 0, 0, 1, 0.5, 0.5]
  const idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    v.push(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0, 0, 0, 1, 0.5 + Math.cos(a) * 0.5, 0.5 - Math.sin(a) * 0.5)
    if (i > 0) idx.push(0, i, i + 1)
  }
  return { data: new Float32Array(v), index: new Uint32Array(idx) }
}

/** An oval tabletop: flat top, a rounded edge all round, flat underside.
 *  Half widths rx, rz; thickness t; edge radius er (at most t/2). Top at y = 0. */
export function slab(rx: number, rz: number, t: number, er: number, seg = 128, prof = 12): MeshData {
  const v: number[] = []
  const idx: number[] = []
  const ring = (a: number) => {
    // a point on the oval and its outward normal in the plane
    const x = Math.cos(a) * rx
    const z = Math.sin(a) * rz
    const nx = Math.cos(a) / rx
    const nz = Math.sin(a) / rz
    const l = Math.hypot(nx, nz)
    return { x, z, nx: nx / l, nz: nz / l }
  }
  // top cap
  v.push(0, 0, 0, 0, 1, 0, 0, 0)
  for (let i = 0; i <= seg; i++) {
    const r = ring((i / seg) * Math.PI * 2)
    v.push(r.x - r.nx * er, 0, r.z - r.nz * er, 0, 1, 0, 0, 0)
    if (i) idx.push(0, i + 1, i)
  }
  // rounded rim: a half-round profile from the top edge round to the bottom edge
  const rimBase = v.length / 8
  for (let i = 0; i <= seg; i++) {
    const r = ring((i / seg) * Math.PI * 2)
    for (let j = 0; j <= prof; j++) {
      const phi = (j / prof) * Math.PI // 0 at the top, PI at the bottom
      const out = Math.sin(phi)
      const up = Math.cos(phi)
      const cy = -t / 2
      const span = t / 2 - er
      const y = up >= 0 ? cy + span + up * er : cy - span + up * er
      v.push(r.x - r.nx * er + r.nx * out * er, y, r.z - r.nz * er + r.nz * out * er, r.nx * out, up, r.nz * out, 0, 0)
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < prof; j++) {
      const a = rimBase + i * (prof + 1) + j
      const b = a + prof + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  // bottom cap
  const botBase = v.length / 8
  v.push(0, -t, 0, 0, -1, 0, 0, 0)
  for (let i = 0; i <= seg; i++) {
    const r = ring((i / seg) * Math.PI * 2)
    v.push(r.x - r.nx * er, -t, r.z - r.nz * er, 0, -1, 0, 0, 0)
    if (i) idx.push(botBase, botBase + i, botBase + i + 1)
  }
  return { data: new Float32Array(v), index: new Uint32Array(idx) }
}

/** One tier of a fir tree: a cone from a drooping, jagged skirt up to a point.
 *  Base at y = 0, tip at y = height. */
export function treeTier(radius: number, height: number, seg = 96, rings = 10, seed = 0): MeshData {
  const v: number[] = []
  const idx: number[] = []
  const rnd = (i: number) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  for (let j = 0; j <= rings; j++) {
    const t = j / rings // 0 at the skirt, 1 at the tip
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      // the skirt is ragged: boughs poke out and sag
      const jag = j === 0 ? 0.75 + 0.5 * rnd(i % seg) : 1
      const r = radius * (1 - t) * jag
      const sag = j === 0 ? -0.25 * height * rnd((i % seg) + 99) : 0
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const y = t * height + sag
      const nl = Math.hypot(height, radius)
      v.push(x, y, z, (Math.cos(a) * height) / nl, radius / nl, (Math.sin(a) * height) / nl, i / seg, t)
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      const b = a + seg + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  return { data: new Float32Array(v), index: new Uint32Array(idx) }
}

/** Many small spheres merged into one mesh; uv.x carries each sphere's index
 *  (so a shader can colour or twinkle them one by one), uv.y its count. */
export function spheres(centres: [number, number, number][], radius: number | number[], seg = 10): MeshData {
  const v: number[] = []
  const idx: number[] = []
  centres.forEach(([cx, cy, cz], k) => {
    const r = Array.isArray(radius) ? radius[k] : radius
    const base = v.length / 8
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI
      for (let i = 0; i <= seg; i++) {
        const ph = (i / seg) * Math.PI * 2
        const nx = Math.sin(th) * Math.cos(ph)
        const ny = Math.cos(th)
        const nz = Math.sin(th) * Math.sin(ph)
        v.push(cx + nx * r, cy + ny * r, cz + nz * r, nx, ny, nz, k, centres.length)
      }
    }
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i
        const b = a + seg + 1
        idx.push(a, b, a + 1, a + 1, b, b + 1)
      }
  })
  return { data: new Float32Array(v), index: new Uint32Array(idx) }
}

/** A unit quad like quad(), subdivided along x so it can bend (a newspaper page). */
export function grid(nx = 28, ny = 2): MeshData {
  const v: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const u = i / nx
      const w = j / ny
      v.push(u - 0.5, 0.5 - w, 0, 0, 0, 1, u, w)
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      const b = a + nx + 1
      idx.push(a, b + 1, a + 1, a, b, b + 1)
    }
  return { data: new Float32Array(v), index: new Uint32Array(idx) }
}
