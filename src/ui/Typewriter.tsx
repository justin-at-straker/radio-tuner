import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { Button } from "@ui-sdk/react/button"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"
import { getUiAgent } from "@/ai/ui-agent"
import { typeSound } from "@/lib/sound"
import { typewriterStore, useTypewriter } from "./typewriterStore"

// The typewriter on the coffee table: a sheet of paper you type a question
// onto, and the answer types itself back, line by line, as on a real machine:
// the newest line sits at the platen and older ones roll up out of sight.
//
// It's live HTML drawn into the room with HTML-in-Canvas, so it's a real text
// field you can type into, select from and read with a screen reader. The
// field and the yes/no buttons are ui-sdk components. The typist behind it
// (api/typist.ts) works the room through the same ui-sdk agent bridge any AI
// agent would use: its tool calls run here, in this page, on the real radio
// and newspaper. Its own page is hidden from the bridge (data-agent-hidden),
// so it can't answer its own questions or press its own "Go ahead".

export const TYPE_PAGE = { w: 600, h: 520 }

/** Runs one of the bridge's three tools for the typist, here in the page. */
async function runTool(name: string, input: unknown) {
  const agent = getUiAgent() as unknown as Record<string, (input?: unknown) => unknown>
  if (name !== "snapshot" && name !== "query" && name !== "act") throw new Error(`No tool called ${name}`)
  return await agent[name](name === "snapshot" ? undefined : input)
}

/** What a step did, said the way a typed stage direction would: [tunes the radio to Jazz24] */
function directionFor(part: { type: string; input?: unknown; state?: string }) {
  const name = part.type.replace(/^tool-/, "")
  if (name !== "act") return null
  const steps = ((part.input as { steps?: { ref?: string; action?: string; args?: unknown[] }[] })?.steps ?? []).map((s) => {
    const what = String(s.args?.[0] ?? "")
    if (s.ref === "Station" && s.action === "setValue") return `tunes the radio to ${what}`
    if (s.ref === "Band" && s.action === "setValue") return what.toUpperCase() === "OFF" ? "reaches to switch the radio off" : `switches the radio to ${what}`
    if (s.ref === "Volume") return `turns the volume to ${what}`
    if (s.ref === "Read the paper") return "picks up the paper"
    if (s.ref?.startsWith("Turn to page") || s.ref?.startsWith("‹ Back to page")) return s.ref.replace(/[‹›]/g, "").trim().toLowerCase().replace(/^turn/, "turns").replace(/^back/, "turns back")
    if (s.ref === "Post the letter") return "reaches for the letter to post it"
    if (s.action === "setValue") return `writes in ${String(s.ref).toLowerCase()}`
    return `${s.action ?? "uses"} ${s.ref ?? ""}`.trim()
  })
  return steps.length ? `[${steps.join(", then ")}]` : null
}

/** A message's lines, in order: what was said, and what was done. */
function linesOf(m: UIMessage) {
  const out: { kind: "said" | "did"; text: string }[] = []
  for (const p of m.parts) {
    if (p.type === "text" && p.text.trim()) out.push({ kind: "said", text: p.text.trim() })
    else if (p.type.startsWith("tool-")) {
      const d = directionFor(p as { type: string; input?: unknown })
      if (d) out.push({ kind: "did", text: d })
    }
  }
  return out
}

/** Types text out at a typist's pace, with a keystroke for each character. */
function useTypedOut(full: string, active: boolean) {
  const [n, setN] = React.useState(active ? 0 : full.length)
  React.useEffect(() => {
    if (n >= full.length) return
    const id = setTimeout(() => {
      const ch = full[n]
      typeSound(ch === " " ? "type-space" : ch === "\n" ? "type-big" : "type")
      setN((v) => Math.min(full.length, v + 1))
    }, full[n] === " " ? 42 : full[n] === "." ? 160 : 26 + Math.random() * 30)
    return () => clearTimeout(id)
  }, [n, full])
  return full.slice(0, n)
}

function TypedLine({ text, kind, fresh }: { text: string; kind: "said" | "did"; fresh: boolean }) {
  const shown = useTypedOut(text, fresh)
  return <p className={`tw-line tw-${kind}`}>{shown}</p>
}

export const TypewriterPage = React.forwardRef<HTMLDivElement>(function TypewriterPage(_, ref) {
  const { open, confirm } = useTypewriter()
  const root = React.useRef<HTMLDivElement | null>(null)
  const setRoot = (el: HTMLDivElement | null) => {
    root.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }
  // sat down: the cursor goes to the page; got up: it leaves it
  React.useEffect(() => {
    const input = root.current?.querySelector<HTMLTextAreaElement>(".tw-input")
    if (open) setTimeout(() => input?.focus({ preventScroll: true }), 350)
    else if (root.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }, [open])
  const [draft, setDraft] = React.useState("")
  // lines typed before this page loaded aren't typed out again
  const settled = React.useRef(new Set<string>())

  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/typist" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      const tc = toolCall as { toolName: string; toolCallId: string; input: unknown }
      runTool(tc.toolName, tc.input).then(
        (output) => addToolOutput({ tool: tc.toolName as never, toolCallId: tc.toolCallId, output: output as never }),
        (e) => addToolOutput({ state: "output-error", tool: tc.toolName as never, toolCallId: tc.toolCallId, errorText: String(e?.message ?? e) }),
      )
    },
  })

  const busy = status === "submitted" || status === "streaming"
  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    typeSound("type-big") // the carriage return
    setDraft("")
    void sendMessage({ text })
  }

  // the latest finished reply, for screen readers (the typed-out text isn't announced as it goes)
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant")
  const announce = status === "ready" && lastReply ? linesOf(lastReply).map((l) => l.text).join(" ") : ""

  return (
    <div
      ref={setRoot}
      drawable=""
      className="type-sheet"
      data-open={open || undefined}
      data-agent-hidden=""
      role="region"
      aria-label="The typewriter: ask about Justin, his work, or this room"
      onFocus={() => typewriterStore.set({ open: true })}
      onClick={() => typewriterStore.set({ open: true })}
    >
      <div className="tw-page">
        <div className="tw-roll">
          <p className="tw-line tw-head">Ask me about Justin, his work, or this room. I can show you around, too.</p>
          {messages.map((m) =>
            linesOf(m).map((l, i) => {
              const key = `${m.id}:${i}`
              const fresh = m.role === "assistant" && !settled.current.has(key)
              settled.current.add(key)
              return m.role === "user" ? (
                <p key={key} className="tw-line tw-asked">
                  {l.text}
                </p>
              ) : (
                <TypedLine key={key} text={l.text} kind={l.kind} fresh={fresh} />
              )
            }),
          )}
          {status === "submitted" && <p className="tw-line tw-thinking">. . .</p>}
          {error && <p className="tw-line tw-did">[the ribbon jams: {error.message.slice(0, 120)}]</p>}
          {confirm && (
            <div className="tw-confirm" role="alertdialog" aria-label="The typist asks">
              <p className="tw-line tw-did">[may I? {confirm.text}]</p>
              <Button className="tw-key" onClick={() => confirm.answer(true)}>
                Go ahead
              </Button>
              <Button className="tw-key" onClick={() => confirm.answer(false)}>
                No thanks
              </Button>
            </div>
          )}
          <Field className="tw-field">
            <FieldLabel className="visually-hidden">Type your question, then press Enter</FieldLabel>
            <Textarea
              className="tw-input"
              rows={1}
              value={draft}
              placeholder={open ? "Type here, then press Enter" : ""}
              onValueChange={(v: string) => setDraft(v)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
          </Field>
        </div>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  )
})
