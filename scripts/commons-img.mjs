const q = process.argv.slice(2).join(" ")
const u = new URL("https://commons.wikimedia.org/w/api.php")
Object.entries({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "30", gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "400", iiextmetadatafilter: "LicenseShortName|Artist" }).forEach(([k, v]) => u.searchParams.set(k, v))
const r = await (await fetch(u, { headers: { "User-Agent": "radio-tuner/0.1" } })).json()
for (const p of Object.values(r.query?.pages ?? {})) {
  const i = p.imageinfo[0], m = i.extmetadata ?? {}
  if (i.width < 1600) continue
  console.log(`${i.width}x${i.height} | ${(m.LicenseShortName?.value ?? "").slice(0, 20)} | ${p.title.slice(5, 90)} | ${i.thumburl}`)
}
