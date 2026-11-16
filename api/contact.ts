// The newspaper's letters page posts here: a Vercel Function that emails the
// letter to Justin through Resend (https://resend.com). The destination
// address and the API key live in environment variables, never in the code:
//
//   RESEND_API_KEY   a Resend API key
//   CONTACT_TO       where letters go
//   CONTACT_FROM     optional sender, e.g. "Radio Tuner <letters@yourdomain>"
//                    (defaults to Resend's onboarding sender, which can only
//                    deliver to the Resend account's own address)
//
// Without them, it says so plainly, and the page suggests LinkedIn instead.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(400, { error: "That letter couldn't be read. Try again?" })
  }
  const get = (k: string) => String(form.get(k) ?? "").trim()
  const name = get("name").slice(0, 120)
  const email = get("email").slice(0, 200)
  const message = get("message").slice(0, 5000)

  // a field people can't see: anything in it came from a bot. Look sent, send nothing.
  if (get("website")) return json(200, { ok: true })

  if (!name) return json(400, { error: "Please sign your letter.", field: "name" })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "That email address doesn't look right.", field: "email" })
  if (message.length < 10) return json(400, { error: "A few more words, please.", field: "message" })

  const key = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_TO
  if (!key || !to) {
    return json(503, { error: "The post office isn't open yet: this form isn't connected. Please write on LinkedIn for now." })
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM ?? "Radio Tuner <onboarding@resend.dev>",
      to: [to],
      reply_to: email,
      subject: `A letter from ${name}, via the Kōwhai Evening Post`,
      text: `${message}\n\n${name} <${email}>`,
      html: `<p>${escape(message).replace(/\n/g, "<br>")}</p><p>${escape(name)} &lt;${escape(email)}&gt;</p>`,
    }),
  })
  if (!response.ok) return json(502, { error: "The letter couldn't be posted just now. Try again in a little while." })
  return json(200, { ok: true })
}
