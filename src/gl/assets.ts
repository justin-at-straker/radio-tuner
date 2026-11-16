// Loading the scanned materials (CC0, Poly Haven) and the studio HDRI.

/** Every asset load is counted here, so the page can show real progress. */
export const loading = { total: 0, done: 0, listeners: new Set<() => void>() }
export function track<T>(p: Promise<T>): Promise<T> {
  loading.total++
  loading.listeners.forEach((l) => l())
  return p.finally(() => {
    loading.done++
    loading.listeners.forEach((l) => l())
  })
}

export const loadTexture = (gl: WebGL2RenderingContext, url: string, srgb: boolean) => track(loadTextureNow(gl, url, srgb))

async function loadTextureNow(gl: WebGL2RenderingContext, url: string, srgb: boolean) {
  const blob = await (await fetch(url)).blob()
  const img = await createImageBitmap(blob, { colorSpaceConversion: "none" })
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic")
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
  img.close()
  return tex
}

/** Parses a Radiance .hdr (RGBE, usually run-length encoded) into linear floats. */
function parseHdr(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let pos = 0
  const line = () => {
    let s = ""
    while (pos < bytes.length && bytes[pos] !== 10) s += String.fromCharCode(bytes[pos++])
    pos++
    return s
  }
  if (!line().startsWith("#?")) throw new Error("not an hdr")
  for (let l = line(); l !== ""; l = line()) {
    /* header lines: FORMAT, EXPOSURE, ... */
  }
  const dims = line().match(/-Y (\d+) \+X (\d+)/)
  if (!dims) throw new Error("unsupported hdr orientation")
  const height = +dims[1]
  const width = +dims[2]
  const out = new Float32Array(width * height * 4)
  const scan = new Uint8Array(width * 4)
  for (let y = 0; y < height; y++) {
    const rle = bytes[pos] === 2 && bytes[pos + 1] === 2 && ((bytes[pos + 2] << 8) | bytes[pos + 3]) === width
    if (rle) {
      pos += 4
      for (let c = 0; c < 4; c++) {
        let x = 0
        while (x < width) {
          let count = bytes[pos++]
          if (count > 128) {
            count -= 128
            const v = bytes[pos++]
            while (count--) scan[x++ * 4 + c] = v
          } else while (count--) scan[x++ * 4 + c] = bytes[pos++]
        }
      }
    } else {
      scan.set(bytes.subarray(pos, pos + width * 4))
      pos += width * 4
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3]
      const f = e ? Math.pow(2, e - 136) : 0
      const o = (y * width + x) * 4
      out[o] = scan[x * 4] * f
      out[o + 1] = scan[x * 4 + 1] * f
      out[o + 2] = scan[x * 4 + 2] * f
      out[o + 3] = 1
    }
  }
  return { width, height, data: out }
}

/** Halves an equirect image, with a little extra blur so rough reflections read soft. */
function downsample(src: { width: number; height: number; data: Float32Array }) {
  const w = Math.max(1, src.width >> 1)
  const h = Math.max(1, src.height >> 1)
  const out = new Float32Array(w * h * 4)
  const at = (x: number, y: number, c: number) => {
    x = ((x % src.width) + src.width) % src.width
    y = Math.max(0, Math.min(src.height - 1, y))
    return src.data[(y * src.width + x) * 4 + c]
  }
  // 4x4 tent around the 2x2 footprint
  const k = [1, 3, 3, 1]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += at(2 * x + i - 1, 2 * y + j - 1, c) * k[i] * k[j]
        out[(y * w + x) * 4 + c] = s / 64
      }
  return { width: w, height: h, data: out }
}

export const loadHdr = (gl: WebGL2RenderingContext, url: string) => track(loadHdrNow(gl, url))

async function loadHdrNow(gl: WebGL2RenderingContext, url: string) {
  const img = parseHdr(await (await fetch(url)).arrayBuffer())
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  let level = img
  let lod = 0
  while (true) {
    gl.texImage2D(gl.TEXTURE_2D, lod, gl.RGBA16F, level.width, level.height, 0, gl.RGBA, gl.FLOAT, level.data)
    if (level.width <= 4) break
    level = downsample(level)
    lod++
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, lod)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return { tex, maxLod: lod }
}
