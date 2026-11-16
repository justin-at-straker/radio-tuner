// Fetches CC0 models (glTF, 1k textures) and textures from Poly Haven into public/models and public/tex.
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname } from "node:path"
const UA = { "User-Agent": "radio-tuner/0.1 (personal project)" }
const MODELS = ["postcard_set_01", "book_encyclopedia_set_01", "sofa_02", "throw_pillows_01", "tea_set_01", "decorative_book_set_01", "mantel_clock_01", "brass_candleholders", "vintage_oil_lamp", "side_table_01", "wooden_bookshelf_worn", "fancy_picture_frame_01", "Rockingchair_01"]
const TEXTURES = { floor: "dark_wooden_planks", wall: "beige_wall_001", stone: "castle_brick_02_red", rug: "fabric_pattern_07" }
const get = async (url) => {
  for (const wait of [0, 4000, 15000, 45000]) {
    await new Promise((r) => setTimeout(r, wait))
    const res = await fetch(url, { headers: UA })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    console.log("  retry", res.status, url)
  }
  throw new Error("failed " + url)
}
const save = async (path, url) => {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, await get(url))
}
for (const id of MODELS) {
  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString())
  const g = files.gltf?.["1k"]?.gltf
  if (!g) { console.log("no gltf for", id, Object.keys(files).join(",")); continue }
  await save(`public/models/${id}/${id}.gltf`, g.url)
  for (const [rel, f] of Object.entries(g.include)) await save(`public/models/${id}/${rel}`, f.url)
  console.log("model", id)
}
for (const [name, id] of Object.entries(TEXTURES)) {
  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString())
  for (const [map, key] of [["Diffuse", "diff"], ["nor_gl", "nor_gl"], ["arm", "arm"]]) {
    const e = files[map]?.["1k"]?.jpg
    if (e) await save(`public/tex/${name}_${key}.jpg`, e.url)
  }
  console.log("texture", name, id)
}
