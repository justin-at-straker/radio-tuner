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
          onClick={() => paperStore.set({ view: viewOf(index - 1) })}
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
          onClick={() => paperStore.set({ view: viewOf(index + 1) })}
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
                <b>Letters to the Editor</b>, write to Justin
              </span>
              <span>4</span>
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
          its agent bridge. Every station plays public-domain records.{" "}
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
    setSent({ state: "sending" });
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        body: new FormData(event.currentTarget),
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
        event.currentTarget?.reset();
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

const PAGES = [FrontPage, WorkPage, ProjectsPage, LettersPage];
const PAGE_NAMES = [
  "Front page",
  "The Work",
  "Projects and Skills",
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
