// Runs Commons audio searches slowly (Commons rate-limits bursts) and writes PD candidates to a file.
import { appendFileSync, writeFileSync } from "node:fs"
const out = "scripts/.cache/candidates.txt"
writeFileSync(out, "")
const queries = process.argv.slice(2)
for (const q of queries) {
  await new Promise((r) => setTimeout(r, 20000))
  const u = new URL("https://commons.wikimedia.org/w/api.php")
  Object.entries({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "30", gsrsearch: `${q} filetype:audio`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal" }).forEach(([k, v]) => u.searchParams.set(k, v))
  const res = await fetch(u, { headers: { "User-Agent": "radio-tuner/0.1 (personal project; low-rate)" } })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { appendFileSync(out, `== ${q}: ERROR ${res.status}\n`); continue }
  appendFileSync(out, `== ${q}\n`)
  for (const p of Object.values(j.query?.pages ?? {})) {
    const i = p.imageinfo?.[0]; const m = i?.extmetadata ?? {}
    const lic = (m.LicenseShortName?.value ?? "").replace(/<[^>]+>/g, "")
    if (!/public domain|cc0/i.test(lic)) continue
    const strip = (s) => (s?.value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").slice(0, 60)
    appendFileSync(out, `${p.title.slice(5, 100)} | ${(i.size / 1e6).toFixed(1)}MB | ${lic} | ${strip(m.DateTimeOriginal)} | ${strip(m.Artist)}\n`)
  }
}
appendFileSync(out, "DONE\n")
