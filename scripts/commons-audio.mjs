// Search Wikimedia Commons for audio files and print licence + metadata.
const q = process.argv.slice(2).join(" ")
const u = new URL("https://commons.wikimedia.org/w/api.php")
Object.entries({
  action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "25",
  gsrsearch: `${q} filetype:audio`,
  prop: "imageinfo", iiprop: "url|size|extmetadata|mime", iiextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal|ObjectName",
}).forEach(([k, v]) => u.searchParams.set(k, v))
const r = await (await fetch(u, { headers: { "User-Agent": "radio-tuner/0.1" } })).json()
for (const p of Object.values(r.query?.pages ?? {})) {
  const i = p.imageinfo?.[0]; const m = i?.extmetadata ?? {}
  const strip = (s) => (s?.value ?? "").replace(/<[^>]+>/g, "").slice(0, 60)
  console.log(`${p.title.slice(5, 85)} | ${(i.size / 1e6).toFixed(1)}MB | ${strip(m.LicenseShortName)} | ${strip(m.DateTimeOriginal)} | ${strip(m.Artist)}`)
}
