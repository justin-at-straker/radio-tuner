// Fetches the station playlists from Wikimedia Commons (public domain recordings,
// 1916-1925), converts them to small mono Opus, and writes a manifest with credits.
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"

const UA = { "User-Agent": "radio-tuner/0.1 (personal project)" }
const PICKS = {
  jazz: [
    ["King Oliver", "Krooked Blues", "King Oliver's Creole Jazz Band: Krooked Blues (1923)"],
    ["Louis Armstrong 1925", "St. Louis Blues (1925)", "Bessie Smith with Louis Armstrong: St. Louis Blues (1925)"],
    ["Original Dixieland Jazz Band", "Livery Stable Blues (1917) with hiss reduction", "Original Dixieland Jass Band: Livery Stable Blues (1917)"],
    ["Original Dixieland Jazz Band", "At the jazz band ball (1918", "Original Dixieland Jass Band: At the Jazz Band Ball (1918)"],
  ],
  dance: [
    ["Paul Whiteman", "Japanese Sandman\", by Paul Whiteman, Acoustic 1920", "Paul Whiteman and his Orchestra: The Japanese Sandman (1920)"],
    ["Paul Whiteman", "Three O'clock In The Morning", "Paul Whiteman and his Orchestra: Three O'Clock in the Morning (1922)"],
    ["Paul Whiteman", "What'll I do (1924", "Paul Whiteman and his Orchestra: What'll I Do (1924)"],
    ["Paul Whiteman", "Rose Room", "Joseph C. Smith's Orchestra: Rose Room (1918)"],
    ["waltz orchestra 1920", "Ben Selvin - I'm Forever Blowing Bubbles", "Selvin's Novelty Orchestra: I'm Forever Blowing Bubbles (1919)"],
  ],
  orchestra: [
    ["Paul Whiteman", "Rhapsody in Blue Part 01", "Gershwin and the Whiteman Concert Orchestra: Rhapsody in Blue, part 1 (1924)"],
    ["Paul Whiteman", "Rhapsody in Blue Part 02", "Gershwin and the Whiteman Concert Orchestra: Rhapsody in Blue, part 2 (1924)"],
    ["Philadelphia Orchestra Stokowski 1925", "DanseMacabre", "Philadelphia Orchestra, Stokowski: Danse Macabre (1925)"],
    ["Victor Symphony Orchestra", "Beethoven 5th symphony fourth movement", "Victor Concert Orchestra: Beethoven, Symphony No. 5, finale (1917)"],
  ],
  lounge: [
    ["Scott Joplin piano roll", "Pleasant Moments Piano Roll", "Scott Joplin, piano roll: Pleasant Moments (1916)"],
    ["Paul Whiteman", "Justin-Tyme", "Roy Bargy, piano roll: Justin-Tyme (1922)"],
    ["Scott Joplin piano roll", "Maple leaf rag - played by Scott Joplin 1916 V2", "Scott Joplin, piano roll: Maple Leaf Rag (1916)"],
    ["Scott Joplin piano roll", "The Entertainer 1902 piano roll", "Scott Joplin, piano roll: The Entertainer"],
  ],
  // US military band recordings are works of the US government, so public domain;
  // traditional carols only.
  christmas: [
    ["Christmas Army Band", "U.S. Army Band - Hark! The Herald Angels Sing", "U.S. Army Band: Hark! The Herald Angels Sing"],
    ["Christmas Army Band", "U.S. Army Band - Good King Wenceslaus", "U.S. Army Band: Good King Wenceslas"],
    ["Christmas Army Band", "U.S. Army Band - O Tannenbaum", "U.S. Army Band: O Tannenbaum"],
    ["Christmas Air Force Band", "O Holy Night - Concert Band - United States Air Force Heritage of America Band", "U.S. Air Force Heritage of America Band: O Holy Night"],
    ["Christmas Army Band", "U.S. Army Band - Here We Come A-wassailing", "U.S. Army Band: Here We Come A-wassailing"],
    ["Christmas Air Force Band", "The First Noel (2020)", "U.S. Air Force Band of Mid-America: The First Noel"],
    ["Christmas Army Band", "U.S. Army Band - Coventry Carol", "U.S. Army Band: Coventry Carol"],
    ["Christmas Air Force Band", "We Wish You a Merry Christmas (2020)", "U.S. Air Force Band of Mid-America: We Wish You a Merry Christmas"],
    ["Christmas Army Band", "O Come, O Come Emmanuel - United States Army Band", "U.S. Army Band: O Come, O Come, Emmanuel"],
    ["Christmas Air Force Band", "Pat-a-pan - Concert Band", "U.S. Air Force Band: Pat-a-pan"],
  ],
  hawaii: [
    ["Hawaiian guitar Ferera", "Frank Ferera, Helen Louise - Hawaiian Portuguese Tango", "Frank Ferera and Helen Louise: Hawaiian Portuguese Tango (1916)"],
    ["Hawaiian guitar Ferera", "Hawaiian Hotel", "Ferera and Paaluhi: Hawaiian Hotel (1925)"],
  ],
  opera: [
    ["Caruso", "La Boheme - O soave fanciulla (restored)", "Caruso and Melba: La bohème, O soave fanciulla (1907)"],
    ["Caruso", "Caruso-AveMaria", "Enrico Caruso: Ave Maria"],
    ["Caruso", "Manon - On L'appelle Manon", "Caruso and Farrar: Manon, On l'appelle Manon (1912)"],
    ["Caruso", "Caruso-Rossini-LaDanza", "Enrico Caruso: Rossini, La danza"],
  ],
}

async function search(q) {
  const u = new URL("https://commons.wikimedia.org/w/api.php")
  Object.entries({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "40",
    gsrsearch: `${q} filetype:audio`, prop: "imageinfo", iiprop: "url|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal|ObjectName",
  }).forEach(([k, v]) => u.searchParams.set(k, v))
  // the API throttles too: back off and retry rather than fall over
  for (const wait of [3000, 20000, 60000, 120000]) {
    await new Promise((res) => setTimeout(res, wait))
    const text = await (await fetch(u, { headers: UA })).text()
    try {
      return Object.values(JSON.parse(text).query?.pages ?? {})
    } catch {
      console.log("  search throttled, waiting")
    }
  }
  return []
}
// Commons rate-limits bursts: check what came back, wait and retry.
async function download(url) {
  for (const wait of [5000, 30000, 90000, 180000]) {
    await new Promise((r) => setTimeout(r, wait))
    const res = await fetch(url, { headers: UA })
    const type = res.headers.get("content-type") ?? ""
    if (res.ok && !type.includes("html")) return Buffer.from(await res.arrayBuffer())
    console.log("  retrying after", res.status, type)
  }
  throw new Error("download failed: " + url)
}
const text = (v) => (v?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const slug = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)

const manifest = {}
const previous = existsSync("src/radio/music.json") ? JSON.parse(readFileSync("src/radio/music.json", "utf8")) : {}
// Written after every track, so whatever has arrived can go on air straight away.
function save() {
  writeFileSync("src/radio/music.json", JSON.stringify(manifest, null, 2))
  const credits = ["# Music credits", "", "Every recording here is in the public domain: 78s published 1907 to 1925, and recent recordings by US military bands", "(works of the US government). Taken from Wikimedia Commons and re-encoded to mono Opus. Licences are as tagged on each Commons page.", ""]
  for (const [station, tracks] of Object.entries(manifest)) {
    credits.push("## " + station, "")
    for (const t of tracks) credits.push("- " + t.label + ". " + t.licence + ". [Source](" + t.source + ")")
    credits.push("")
  }
  writeFileSync("public/music/CREDITS.md", credits.join(String.fromCharCode(10)))
}

for (const [station, picks] of Object.entries(PICKS)) {
  mkdirSync(`public/music/${station}`, { recursive: true })
  manifest[station] = []
  for (const [q, want, label] of picks) {
    // already converted on an earlier run: keep it, no need to ask Commons again
    const had = previous[station]?.find((t) => t.label === label)
    if (had && existsSync("public" + had.src)) {
      manifest[station].push(had)
      continue
    }
    const page = (await search(q)).find((p) => p.title.includes(want))
    if (!page) { console.log("NOT FOUND", station, want); continue }
    const info = page.imageinfo[0]
    const m = info.extmetadata
    const licence = text(m.LicenseShortName)
    if (!/public domain/i.test(licence)) { console.log("SKIP (licence)", page.title, licence); continue }
    const name = slug(page.title.slice(5))
    const raw = `scripts/.cache/${name}${page.title.match(/\.[a-z0-9]+$/i)[0]}`
    const out = `public/music/${station}/${name}.opus`
    mkdirSync("scripts/.cache", { recursive: true })
    if (!existsSync(raw)) {
      try {
        writeFileSync(raw, await download(info.url))
      } catch (e) {
        console.log("SKIP (download)", page.title, e.message)
        continue
      }
    }
    if (!existsSync(out))
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-ac", "1", "-ar", "48000", "-af", "loudnorm=I=-18:TP=-2", "-c:a", "libopus", "-b:a", "40k", out])
    const dur = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString()
    manifest[station].push({
      src: `/music/${station}/${name}.opus`,
      label,
      title: page.title.slice(5).replace(/\.[a-z0-9]+$/i, ""),
      performer: text(m.Artist).slice(0, 200),
      date: text(m.DateTimeOriginal).slice(0, 80),
      licence,
      source: page.imageinfo[0].descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      duration: Math.round(dur),
    })
    save()
    console.log("ok", station, Math.round(dur) + "s", page.title)
  }
}
save()
