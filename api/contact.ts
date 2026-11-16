// The newspaper's letters page posts here: a Vercel Function that emails the
// letter to Justin straight from his own mailbox, over SMTP (Nodemailer, a
// library bundled with the function: no email service in between). The login
// lives in environment variables, never in the code:
//
//   SMTP_USER   the Gmail address that sends the letters
//   SMTP_PASS   a Google App Password for it (needs 2-step verification on)
//   CONTACT_TO  where letters go (defaults to SMTP_USER)
//   SMTP_HOST   optional, defaults to smtp.gmail.com (port 465, TLS)
//
// Letters arrive from that mailbox with the writer's address as Reply-To, so
// replying answers them. Without the login, the page says the post office
// isn't open yet and suggests LinkedIn instead.

import { checkBotId } from "botid/server"
import nodemailer from "nodemailer"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// keeping a public form from becoming a way to flood the inbox
const PER_HOUR = 5 // letters from one address, per instance
const seen = new Map<string, number[]>()
function tooMany(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  const now = Date.now()
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  recent.push(now)
  seen.set(ip, recent)
  return recent.length > PER_HOUR
}

export async function POST(request: Request) {
  // Vercel BotID: an invisible browser check, no puzzle to solve
  const verdict = await checkBotId({ advancedOptions: { headers: Object.fromEntries(request.headers) } })
  if (verdict.isBot) return json(403, { error: "The post office couldn't tell you're a person. Try again from a regular browser?" })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(400, { error: "That letter couldn't be read. Try again?" })
  }
  const get = (k: string) => String(form.get(k) ?? "").trim()
  const name = get("name").slice(0, 120).replace(/[\r\n]+/g, " ")
  const email = get("email").slice(0, 200)
  const message = get("message").slice(0, 5000)

  // a field people can't see, or a letter posted the moment the page opened:
  // a bot. Look sent, send nothing.
  if (get("website") || Number(get("elapsed") || 0) < 3000) return json(200, { ok: true })

  if (!name) return json(400, { error: "Please sign your letter.", field: "name" })
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return json(400, { error: "That email address doesn't look right.", field: "email" })
  if (message.length < 10) return json(400, { error: "A few more words, please.", field: "message" })
  if (tooMany(request)) return json(429, { error: "That's a lot of letters. Give the post office an hour, then try again." })

  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    return json(503, { error: "The post office isn't open yet: this form isn't connected. Please write on LinkedIn for now." })
  }

  const mail = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  })
  try {
    await mail.sendMail({
      from: { name: "The Kōwhai Evening Post", address: user },
      to: process.env.CONTACT_TO ?? user,
      replyTo: { name, address: email },
      subject: `A letter from ${name}, via the Kōwhai Evening Post`,
      text: `${message}\n\n${name} <${email}>\n\n(Sent from the letters page of the Kōwhai Evening Post. Reply to answer ${name}.)`,
      html: letterHtml(name, email, message),
    })
  } catch (e) {
    console.error("letter not sent:", e instanceof Error ? e.message : e)
    return json(502, { error: "The letter couldn't be posted just now. Try again in a little while." })
  }
  return json(200, { ok: true })
}

// ---------------------------------------------------------------- the letter, as it arrives
// Styled like a clipping from the paper: a cream sheet, the masthead, the
// letter in a serif, the writer's name signed at the foot. Email clients only
// take tables and inline styles, and no web fonts, so it's Georgia throughout.

function letterHtml(name: string, email: string, message: string) {
  const ink = "#1d1913"
  const muted = "#5a4d3c"
  const red = "#7a140e"
  const serif = "Georgia,'Times New Roman',serif"
  const date = new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland" }).format(new Date())
  const paragraphs = escape(message)
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px;font:17px/1.55 ${serif};color:${ink};">${p.replace(/\n/g, "<br>")}</p>`)
    .join("")
  const small = `font:10px/1.4 ${serif};letter-spacing:2px;text-transform:uppercase;color:${muted};`
  return `<!doctype html>
<html lang="en-NZ">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>A letter from ${escape(name)}</title></head>
<body style="margin:0;padding:0;background:#2a1d14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2a1d14;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#efe7d4;border:1px solid #c9b993;">
    <tr><td style="padding:22px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="${small}">Letters to the Editor</td>
        <td align="right" style="${small}">Auckland, New Zealand</td>
      </tr></table>
      <div style="margin:10px 0 0;text-align:center;font:bold 34px/1.1 ${serif};color:${ink};">The Kōwhai Evening Post</div>
      <div style="margin:10px 0 0;border-top:1px solid ${ink};border-bottom:3px double ${ink};padding:5px 0;text-align:center;${small}">${escape(date)}</div>
    </td></tr>
    <tr><td style="padding:26px 32px 6px;">
      ${paragraphs}
      <div style="margin:22px 0 0;text-align:right;font:italic 17px/1.5 ${serif};color:${ink};">Yours,<br><span style="font-style:normal;font-weight:bold;">${escape(name)}</span><br><a href="mailto:${escape(email)}" style="font:14px ${serif};color:${red};">${escape(email)}</a></div>
    </td></tr>
    <tr><td style="padding:18px 32px 24px;">
      <div style="border-top:1px solid ${ink};padding-top:10px;text-align:center;font:12px/1.5 ${serif};color:${muted};">Posted from the letters page at <a href="https://justin-cole.vercel.app" style="color:${red};">justin-cole.vercel.app</a>. Reply to this email to answer ${escape(name)}.</div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}
