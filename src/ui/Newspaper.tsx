import * as React from "react";
import { Button } from "@ui-sdk/react/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Textarea } from "@ui-sdk/react/textarea";
import { BANDS, formatFreq } from "@/radio/stations";
import {
  PAGE_COUNT,
  PAGES_IN_VIEW,
  paperStore,
  usePaper,
  viewOf,
} from "./paperStore";

// The newspaper on the coffee table: four pages that are really Justin's CV,
// with a letters page to get in touch. Every page is live HTML drawn into the
// room with HTML-in-Canvas, so the text selects, Ctrl+F finds it, links work,
// and screen readers (and search engines) read it as articles. The controls
// (turning pages, picking it up, the letter form) are ui-sdk components, so
// they're keyboard- and screen-reader-accessible, and agents can use them too.
//
// Phone and email are left off on purpose: the site is public. Letters go
// through a server function that keeps the address private.

export const PAPER = { w: 860, h: 1220 };

const TITLE = "The Kōwhai Evening Post";

function Masthead({ small }: { small?: boolean }) {
  const { held } = usePaper();
  return (
    <header className="masthead" data-small={small || undefined}>
      <div className="ears">
        <span>Late Edition</span>
        <span>Auckland, New Zealand</span>
        {!small ? (
          <Button
            className="read-button"
            onClick={() => paperStore.set({ held: !held })}
          >
            {held ? "Put the paper down" : "Read the paper"}
          </Button>
        ) : (
          <span>Price Threepence</span>
        )}
      </div>
      <h1>{TITLE}</h1>
      <div className="dateline">
        <span>Monday, 16 November 2026</span>
        <span>No. 157</span>
        <span>Fine, with a southerly change</span>
      </div>
    </header>
  );
}

/** The foot of every page: its number, and a button to turn the sheet. Like a
 *  real paper, left-hand pages turn back and right-hand pages turn on. */
function Folio({ index }: { index: number }) {
  const left = index % 2 === 1;
  return (
    <footer className="folio">
      {left ? (
        <Button
          className="turn"
          onClick={() => paperStore.set({ held: true, view: viewOf(index - 1) })}
        >
          ‹ Back to page {index}
        </Button>
      ) : (
        <span />
      )}
      <span className="folio-number">
        Page {index + 1} of {PAGE_COUNT} · {TITLE}
      </span>
      {!left && index < PAGE_COUNT - 1 ? (
        <Button
          className="turn"
          onClick={() => paperStore.set({ held: true, view: viewOf(index + 1) })}
        >
          Turn to page {index + 2} ›
        </Button>
      ) : (
        <span />
      )}
    </footer>
  );
}

function FrontPage() {
  return (
    <>
      <Masthead />
      <h2 className="headline">Local Engineer Teaches Machines to Translate</h2>
      <p className="deck">
        Justin Cole, AI / ML Engineer, builds the models behind machine
        translation and LLM systems, and the products around them
      </p>
      <div className="front-body">
        {/* the photo across two columns, the lead story beneath it in two more */}
        <div className="front-main">
          <figure className="photo">
            <img src="/press/justin.jpg" alt="Justin Cole" />
            <figcaption>
              Justin Cole, AI / ML engineer at Arbitr (formerly Straker),
              pictured at home in Auckland.
            </figcaption>
          </figure>
          <div className="front-story">
            <p className="lead">
              <span className="dropcap">A</span>UCKLAND. A full-stack developer
              and AI/ML engineer with five years of shipping software, Mr Cole
              builds custom models (training data, fine-tuning, evaluation and
              production serving) and the products around them: APIs and
              microservices, React and Next.js frontends, and integrations into
              tools like Slack, Teams and n8n.
            </p>
            <p>
              He also likes the research side, he told the Post: testing an idea
              properly, writing up what he found, and turning it into a
              decision.
            </p>
          </div>
        </div>
        {/* the third column: the second story, the index, the weather */}
        <div className="front-side">
          <h3>Model Factory Opens at Arbitr</h3>
          <p>
            At Arbitr, formerly Straker, he co-built in a two-person team the
            platform that takes a custom translation model from raw data to live
            customer traffic, turning each client model into a repeatable
            release rather than a one-off project. <em>Full story, page 2.</em>
          </p>
          <h3>Inside Today</h3>
          <ul className="index">
            <li>
              <span>
                <b>The Work</b>, four roles in full
              </span>
              <span>2</span>
            </li>
            <li>
              <span>
                <b>Projects &amp; Skills</b>, this very radio among them
              </span>
              <span>3</span>
            </li>
            <li>
              <span>
                <b>How This Room Was Built</b>, the making of this site
              </span>
              <span>4</span>
            </li>
            <li>
              <span>
                <b>Letters to the Editor</b>, write to Justin
              </span>
              <span>6</span>
            </li>
          </ul>
          <p className="weather">
            <b>Weather.</b> Fine, with a southerly change by evening. Snow on
            the window, a fire in the grate.
          </p>
        </div>
      </div>
    </>
  );
}

function WorkPage() {
  return (
    <>
      <Masthead small />
      <h2 className="section-head">The Work</h2>
      <div className="columns">
        <h3>Model Factory Opens at Arbitr</h3>
        <p className="byline">
          AI/ML Engineer, Arbitr (formerly Straker) · March 2026 to present
        </p>
        <p>
          Co-built, in a two-person team, the platform that takes a custom
          translation model from raw data to live customer traffic: data
          curation, fine-tuning and continued pretraining on GPU clusters,
          release evaluation, a model registry, and serving on Kubernetes GPU
          and IBM watsonx.ai with traffic routing (Python, vLLM, LiteLLM and
          AWS, with a React/Vite control plane). Each client model (10+
          languages; legal, medical, financial and technical domains) becomes a
          repeatable release rather than a one-off project.
        </p>
        <p>
          A response cache now stops repeat translation requests from spending
          GPU capacity, placed beside the GPU service to avoid cross-datacenter
          lookups. In a repeat-file test, 324 of 325 segments returned from
          cache at about a millisecond each, without another model generation.
        </p>
        <p>
          He designed the release evaluation gate (frozen benchmarks,
          contamination checks, BLEU, COMET and blind LLM-judge panels), so
          regressions and test-set leakage are caught before a model reaches
          customers, and built the training-data pipeline (licence and
          provenance checks, deduplication, quality-estimation scoring, domain
          and register classification) over 100M+ sentence pairs.
        </p>
        <h3>Translation Comes to Teams and Slack</h3>
        <p className="byline">
          Full-stack Developer, Arbitr · January 2025 to March 2026
        </p>
        <p>
          Integrated AI translation into Microsoft Teams and Slack for global
          clients including IBM, so multilingual teams could talk in real time
          inside the tools they already use.
        </p>
        <p>
          Built and published the Verify MCP server and an n8n community node,
          plus Zapier, Power Automate and Latenode connectors, letting AI agents
          and automation workflows call translation directly. Also a
          transcription microservice returning transcripts in about a minute,
          and an OAuth/SAML auth service that unified login across the
          platforms.
        </p>
        <h3>Toyota Customers Track Their Cars</h3>
        <p className="byline">
          Frontend Developer, Digitas New Zealand · May 2021 to December 2024
        </p>
        <p>
          Built a vehicle order tracker for Toyota Australia that let customers
          follow their order through the purchase lifecycle in real time,
          instead of calling the dealer (React, Next.js, GraphQL).
        </p>
        <p>
          Delivered frontends for Toyota NZ/AU, Countdown/Woolworths and
          McDonald's Australia in React, Next.js, Vue.js and TypeScript, working
          with backend teams on API contracts, and built modular email and push
          templates for loyalty programmes with Braze and Salesforce Marketing
          Cloud.
        </p>
        <h3>Tankers Get a Route Planner</h3>
        <p className="byline">
          Senior Frontend Developer (contract, alongside Digitas), JHCS ·
          November 2023 to March 2024
        </p>
        <p>
          Built the frontend for a SaaS that lets tanker operators plan delivery
          routes, with live-updating maps and data views (Next.js, tRPC,
          Tailwind, shadcn/ui on a .NET API), and wrote the docs the team
          carried forward.
        </p>
        <h3>Earlier</h3>
        <p>
          Team Leader and Foreign Exchange Consultant, Travel Money Group
          (Flight Centre), 2016 to 2020.
        </p>
      </div>
    </>
  );
}

function ProjectsPage() {
  return (
    <>
      <Masthead small />
      <h2 className="section-head">Projects &amp; Skills</h2>
      <div className="columns">
        <h3>A Wireless Set You Can Talk To</h3>
        <p>
          The radio on this very table is a working demonstration: a 1950s valve
          set in WebGL whose dial, keys and knobs are live HTML drawn with
          HTML-in-Canvas, built with ui-sdk, and operable by AI agents through
          its agent bridge. The music is live radio, from RNZ in Auckland to Hilversum and Maui.{" "}
          <a
            href="https://github.com/justin-at-straker/radio-tuner"
            target="_blank"
            rel="noopener"
          >
            Source on GitHub
          </a>
          .
        </p>
        <h3>A Groovebox in the Browser</h3>
        <p>
          OSC-8, a browser groovebox: a Rust/WebAssembly wavetable synth and
          drum sampler with hardware-style controls and AI sound design you can
          still tweak by hand.{" "}
          <a href="https://osc-8.vercel.app" target="_blank" rel="noopener">
            osc-8.vercel.app
          </a>
          .
        </p>
        <h3>From the Lab</h3>
        <p>
          Write-ups of experiments and findings from Arbitr's AI work, including
          the translation cache, at{" "}
          <a href="https://labs.straker.ai" target="_blank" rel="noopener">
            labs.straker.ai
          </a>
          .
        </p>
        <h3>Classifieds: Skills</h3>
        <dl className="skills">
          <dt>ML</dt>
          <dd>
            PyTorch, Hugging Face, LoRA/QLoRA, continued pretraining, NMT,
            distributed GPU training (CUDA, Brev)
          </dd>
          <dt>Data &amp; Eval</dt>
          <dd>
            Corpus curation, dedup, quality estimation, BLEU, COMET,
            LLM-as-judge, contamination checks
          </dd>
          <dt>Serving &amp; MLOps</dt>
          <dd>
            vLLM, LiteLLM, AWS, Kubernetes, IBM watsonx.ai, Docker, GitHub
            Actions, Azure DevOps
          </dd>
          <dt>Languages</dt>
          <dd>Python, TypeScript, JavaScript</dd>
          <dt>Backend</dt>
          <dd>
            FastAPI, Node.js, tRPC, REST/GraphQL APIs, microservices,
            OAuth/SAML, PostgreSQL, Redis
          </dd>
          <dt>Frontend</dt>
          <dd>
            React, Next.js, Vue.js, Vite, Tailwind CSS, shadcn/ui, Framer Motion
          </dd>
          <dt>AI &amp; Integrations</dt>
          <dd>
            MCP servers, A2A, agent tooling, RAG, n8n, Zapier, Power Automate,
            Slack/Teams apps
          </dd>
        </dl>
        <h3>Education &amp; Certifications</h3>
        <p>
          Full-stack Software Development Bootcamp, Dev Academy Aotearoa
          (Enspiral), Auckland, 2020 to 2021. Braze Certified Technical
          Architect; Braze Certified Developer.
        </p>
        <h3>Wireless Listings</h3>
        <table className="listings">
          <tbody>
            {BANDS.flatMap((band) =>
              band.stations.map((st) => (
                <tr key={st.name}>
                  <td>{formatFreq(band, st.freq)}</td>
                  <td>
                    <b>{st.name}.</b> {st.blurb}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Sent =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent" }
  | { state: "error"; message: string; field?: string };

function LettersPage() {
  const [sent, setSent] = React.useState<Sent>({ state: "idle" });
  const fieldError = (name: string) =>
    sent.state === "error" && sent.field === name ? sent.message : "";
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSent({ state: "sending" });
    try {
      const data = new FormData(form);
      // how long the page has been open: people take more than a moment to write
      data.set("elapsed", String(Math.round(performance.now())));
      const response = await fetch("/api/contact", {
        method: "POST",
        body: data,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        field?: string;
      };
      if (response.status === 404) {
        // the dev server has no server functions: only the deployed site does
        setSent({
          state: "error",
          message:
            "The post office only opens on the live site, where the letters service runs.",
        });
        return;
      }
      if (response.ok) {
        setSent({ state: "sent" });
        form.reset();
      } else
        setSent({
          state: "error",
          message: body.error ?? "The letter didn't go through.",
          field: body.field,
        });
    } catch {
      setSent({
        state: "error",
        message: "The post office couldn't be reached. Try again in a moment.",
      });
    }
  }
  return (
    <>
      <Masthead small />
      <h2 className="section-head">Letters to the Editor</h2>
      <div className="letters">
        <p className="lead">
          <span className="dropcap">W</span>rite to Justin about a role, a
          project, or the radio on the table. Letters go straight to him, and he
          replies to every one.
        </p>
        <form
          className="letter-form"
          onSubmit={send}
          aria-label="Write to Justin"
        >
          <Field name="name" className="field">
            <FieldLabel className="field-label">Your name</FieldLabel>
            <Input
              className="field-input"
              required
              autoComplete="name"
              onValueChange={() =>
                sent.state === "error" && setSent({ state: "idle" })
              }
            />
            <FieldError className="field-error" />
          </Field>
          <Field
            name="email"
            className="field"
            invalid={fieldError("email") ? true : undefined}
          >
            <FieldLabel className="field-label">Your email</FieldLabel>
            <Input
              className="field-input"
              type="email"
              required
              autoComplete="email"
              onValueChange={() =>
                sent.state === "error" && setSent({ state: "idle" })
              }
            />
            <FieldDescription className="field-description">
              So he can write back. It isn't shared or published.
            </FieldDescription>
            <FieldError className="field-error">
              {(state) => fieldError("email") || state.message}
            </FieldError>
          </Field>
          <Field
            name="message"
            className="field"
            invalid={fieldError("message") ? true : undefined}
          >
            <FieldLabel className="field-label">Your letter</FieldLabel>
            <Textarea
              className="field-input letter-body"
              required
              minLength={10}
              rows={8}
              onValueChange={() =>
                sent.state === "error" && setSent({ state: "idle" })
              }
            />
            <FieldError className="field-error">
              {(state) => fieldError("message") || state.message}
            </FieldError>
          </Field>
          {/* a field people can't see, for bots to fill in */}
          <input
            className="honeypot"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <Button
            className="send"
            type="submit"
            disabled={sent.state === "sending"}
            data-agent-confirm="Sends your letter to Justin by email"
          >
            {sent.state === "sending" ? "Posting…" : "Post the letter"}
          </Button>
          <p className="sent-status" role="status" aria-live="polite">
            {sent.state === "sent"
              ? "Thank you. Your letter is in the post."
              : sent.state === "error" && !sent.field
                ? sent.message
                : ""}
          </p>
        </form>
        <p className="also">
          Or find him on{" "}
          <a
            href="https://linkedin.com/in/justinlcole"
            target="_blank"
            rel="noopener"
          >
            LinkedIn
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/justin-at-straker"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
          .
        </p>
      </div>
    </>
  );
}

/** The feature across the middle spread: how this room was made, and why. */
function MakingOfPage() {
  return (
    <>
      <Masthead small />
      <h2 className="section-head">How This Room Was Built</h2>
      <div className="columns">
        <p className="standfirst">
          A valve radio, a typewriter that answers back, and a newspaper that is
          really a CV. The Post looks inside the parlour on Mr Cole's website,
          and at the decisions that shaped it.
        </p>
        <h3>It Began With a Question</h3>
        <p>
          The idea started with a demonstration of{" "}
          <a
            href="https://developer.chrome.com/blog/html-in-canvas"
            target="_blank"
            rel="noopener"
          >
            HTML-in-Canvas
          </a>
          , a new Chrome feature that lets a web page draw real HTML into a 3D
          scene. The
          question was what to build to show it off. A short brainstorm landed
          on an old radio tuner: something with a dial, keys and knobs, made to
          be touched.
        </p>
        <p>
          From there it grew one request at a time. The radio needed somewhere
          to live, so it got a room. The room felt bare, so it got a fire, a
          Christmas tree, snow at the window and a coffee table. The table
          needed something on it, so a newspaper arrived, and the newspaper
          became the CV you are reading.
        </p>
        <h3>Why HTML in the Canvas</h3>
        <p>
          Most 3D sites paint their text as pictures, so it can't be selected,
          searched or read aloud. Here every label on the dial, every key and
          every page of this paper is live HTML. Chrome draws each element into
          a texture, the scene lays it onto the radio's glass or the paper's
          sheet, and every frame the browser is told exactly where that element
          landed in 3D, so clicks, focus and text selection follow the drawing,
          even with the radio turned upside down. The price is reach: it needs
          Chrome or Edge 157 or later.
        </p>
        <h3>Drawn by Hand, in WebGL</h3>
        <p>
          Rather than reach for a 3D library, the scene is written directly in
          WebGL2, with one shader for everything from the radio's lacquered
          rosewood to the fire and the falling snow. That kept every decision in
          view and made the unusual parts easier: textures that are web pages,
          a polished table that reflects the radio, the lamp's shadows, and a
          soft focus on the room behind. The furniture and textures are free
          scans from Poly Haven; the typewriter is a model by landout on
          Sketchfab.
        </p>
        <p>
          A photograph behind the radio was considered and turned down in
          favour of a real room, so that light, shadow and reflection would
          agree. Realism came from looking: every change was checked in a real
          browser, picture by picture, and the faults were plain to see. A cup
          hovering above the table, a tag through a teapot's spout, a saucer
          poking through this very paper. Each was spotted, then fixed.
        </p>
        <h3>Controls Anyone Can Use</h3>
        <p>
          The radio's controls are built with{" "}
          <a href="https://ui-sdk.dev" target="_blank" rel="noopener">
            ui-sdk
          </a>
          , a component library for interfaces that agents can use as well as
          people. The knobs take the
          keyboard, the band keys are a proper radio group, and the dial is a
          custom Station component you can tune by name. The same components
          serve people, screen readers and AI agents alike, through an agent
          bridge that lists every control and lets an agent work it, asking the
          person first for anything that matters.
        </p>
      </div>
    </>
  );
}

function MakingOfPageTwo() {
  return (
    <>
      <Masthead small />
      <h2 className="section-head">How This Room Was Built, Continued</h2>
      <div className="columns">
        <h3>The Sound of the Set</h3>
        <p>
          The radio first played sounds it made itself: Morse, the time pips
          and a spoken coastal forecast, all still on the dial. Music arrived
          next as public-domain 78s, then gave way to a better idea: real
          radio. RNZ National and RNZ Concert sit on their actual Auckland
          frequencies, beside NPO Klassiek from Hilversum, Jazz24 and others,
          each checked to stream securely and to let its sound through the
          browser's audio engine.
        </p>
        <p>
          That matters because everything passes through a model of the set:
          hiss between stations, a whistle near a carrier, the softness of a
          valve, then the room's own echo. A station only connects while you
          are tuned near it. The fire is a recording of a real one, the pages
          turn with real paper, and the typewriter is a museum recording cut
          into twelve keystrokes, a space bar, a bell and a carriage return.
        </p>
        <h3>The Paper Itself</h3>
        <p>
          The CV became a broadsheet you can pick up: folded in half on the
          table, unfolding in your hands, printed on both sides. Making it
          readable took several passes: larger type in a sturdier serif, two
          wide columns instead of three, and lighting that steps aside while
          you read. It behaves like newsprint too, matte and a little floppy as
          a page turns, and thin enough that the fire glows through it.
        </p>
        <h3>A Typewriter That Answers</h3>
        <p>
          The typewriter is an assistant, not a chat box. Type a question onto
          its sheet and the answer types itself back, from Claude Haiku through
          Vercel's AI Gateway and the AI SDK. It has no hands of its own: its
          tools are ui-sdk's agent tools, run in your browser on the same radio,
          newspaper and letters form you can touch. Ask about Mr Cole's work
          and it opens this paper at the right page; ask for music and it tunes
          the radio. Posting a letter needs your yes, asked on the page. A
          cheaper model was tried and couldn't reliably tune the radio, so
          Claude stayed.
        </p>
        <h3>The Quiet Parts</h3>
        <p>
          Letters are emailed straight from Mr Cole's own mailbox, with no
          email service in between. Vercel's BotID keeps bots away from the
          letters page and the typewriter, and prompt caching keeps each answer
          cheap. The menu along the top brings each thing into view with a
          single click.
        </p>
        <h3>How It Was Made</h3>
        <p>
          The room was built in conversation with Claude Code, an AI coding
          agent, over a couple of long evenings: Mr Cole asking, looking and
          correcting; the agent building, testing in a real browser and
          reporting back. Most of the craft was in the looking.{" "}
          <a
            href="https://github.com/justin-at-straker/radio-tuner"
            target="_blank"
            rel="noopener"
          >
            The source is on GitHub
          </a>
          .
        </p>
      </div>
    </>
  );
}

const PAGES = [FrontPage, WorkPage, ProjectsPage, MakingOfPage, MakingOfPageTwo, LettersPage];
const PAGE_NAMES = [
  "Front page",
  "The Work",
  "Projects and Skills",
  "How This Room Was Built",
  "How This Room Was Built, continued",
  "Letters to the Editor",
];

/** One page of the paper, as a drawable sheet. Only the open page can be reached. */
export const NewspaperPage = React.forwardRef<
  HTMLDivElement,
  { index: number }
>(function NewspaperPage({ index }, ref) {
  const { held, view } = usePaper();
  const open = held ? PAGES_IN_VIEW[view].includes(index) : index === 0;
  const Content = PAGES[index];
  return (
    <div
      ref={ref}
      drawable=""
      className="paper-sheet"
      data-held={held || undefined}
      inert={!open}
      role="region"
      aria-label={`${TITLE}, page ${index + 1} of ${PAGE_COUNT}: ${PAGE_NAMES[index]}`}
    >
      <article className="paper">
        <Content />
        <Folio index={index} />
      </article>
    </div>
  );
});

/** Announces page turns to screen readers. Rendered outside the canvas. */
export function PaperAnnouncer() {
  const { held, view } = usePaper();
  const pages = PAGES_IN_VIEW[view];
  const said = pages
    .map((p) => `page ${p + 1}, ${PAGE_NAMES[p]}`)
    .join(", and ");
  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {held ? `${TITLE}: ${said}, of ${PAGE_COUNT}` : ""}
    </p>
  );
}
