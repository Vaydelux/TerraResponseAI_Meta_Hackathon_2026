"use client";

import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { ArrowRight, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui-tr/Button";
import { Wordmark } from "@/components/layout/Wordmark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SampleImage } from "@/components/landing/SampleImage";
import { DEMO_REPORT, INITIAL_DEMO, demoReducer, type DemoDecision, type DemoStage } from "@/lib/demo/walkthrough";
import styles from "./walkthrough.module.css";

const STEPS: { id: DemoStage; label: string }[] = [
  { id: "report", label: "Report" }, { id: "observation", label: "Understand" },
  { id: "review", label: "Review" }, { id: "map", label: "Map" },
];
const TITLES: Record<DemoStage, string> = {
  report: "Start with the evidence.", observation: "Keep uncertainty in view.",
  review: "A person makes the decision.", map: "Carry the decision forward.",
};

function ReviewForm({ onDecision }: { onDecision: (decision: DemoDecision) => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    if (note.length < 12 || note.length > 400) {
      setError("Explain your sample decision in 12–400 characters.");
      return;
    }
    const action = data.get("decision");
    if (action !== "confirm" && action !== "reject") return;
    onDecision({ action, note });
  }
  return (
    <form onSubmit={submit} className={styles.stack}>
      <p>You are acting as a <strong>sample reviewer</strong>. In the real workspace, an independently authorized reviewer checks the report; this role switch is only a simulation.</p>
      <fieldset className={styles.choices}>
        <legend>Sample decision</legend>
        <label><input type="radio" name="decision" value="confirm" defaultChecked required />Confirm the visible observation</label>
        <label><input type="radio" name="decision" value="reject" />Reject this sample report</label>
      </fieldset>
      <label className={styles.stack} htmlFor="demo-review-note">
        <strong>Explain your decision</strong>
        <span id="demo-note-help">12–400 characters. Confirmation does not establish water depth, photo authenticity or safe access.</span>
        <textarea id="demo-review-note" name="note" rows={4} minLength={12} maxLength={400} required aria-describedby={`demo-note-help${error ? " demo-note-error" : ""}`} aria-invalid={error ? true : undefined} onChange={() => { if (error) setError(""); }} />
      </label>
      {error && <p id="demo-note-error" role="alert">{error}</p>}
      <Button variant="primary" type="submit">Save simulated decision <ArrowRight size={18} aria-hidden="true" /></Button>
    </form>
  );
}

function SampleMap({ confirmed }: { confirmed: boolean }) {
  return (
    <figure className={styles.stack}>
      <svg viewBox="0 0 400 220" role="img" aria-label={confirmed ? "Offline coordinate diagram with one simulated confirmed report" : "Offline coordinate diagram with no confirmed reports"} className={styles.map}>
        <path d="M0 55H400 M0 110H400 M0 165H400 M80 0V220 M160 0V220 M240 0V220 M320 0V220" fill="none" stroke="var(--rule-strong)" />
        <path d="M20 180Q120 40 200 130T390 30" fill="none" stroke="var(--tide)" strokeWidth="12" opacity=".18" />
        {confirmed && <><circle cx="200" cy="110" r="18" fill="var(--green-wash)" stroke="var(--green)" strokeWidth="2" /><circle cx="200" cy="110" r="6" fill="var(--green)" /></>}
      </svg>
      <figcaption>Offline coordinate diagram, not a basemap or emergency feed. Center: {DEMO_REPORT.location.latitude.toFixed(3)}° N, {DEMO_REPORT.location.longitude.toFixed(3)}° E. Coordinates are seeded examples, not the image&apos;s verified origin.</figcaption>
    </figure>
  );
}

export function DemoWalkthrough() {
  const [state, dispatch] = useReducer(demoReducer, INITIAL_DEMO);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(state.stage);
  useEffect(() => {
    if (previousStage.current !== state.stage) heading.current?.focus();
    previousStage.current = state.stage;
  }, [state.stage]);
  const confirmed = state.decision?.action === "confirm";
  const unavailable = state.scenario === "ai-unavailable";
  const step = STEPS.findIndex((item) => item.id === state.stage);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Wordmark /><ThemeToggle />
        <Button href="/">Back to overview</Button>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <div className={styles.banner}>
          <ShieldCheck size={22} aria-hidden="true" />
          <div><strong>Simulated walkthrough · No live reports or Meta calls</strong><p>Seeded illustration and sample observations. Decisions stay in this tab and disappear on reset or reload. Nothing is uploaded.</p></div>
        </div>
        <div className={styles.intro}>
          <div><p className={styles.eyebrow}>Meta Hackathon 2026 · Interactive sample</p><h1>See the workflow. Keep the uncertainty.</h1><p>Explore the reporting journey even when sign-in, model services or map tiles are unavailable.</p></div>
          <Button onClick={() => dispatch({ type: "reset" })}><RotateCcw size={18} aria-hidden="true" />Reset walkthrough</Button>
        </div>
        <ol className={styles.steps} aria-label="Walkthrough progress">
          {STEPS.map((item, index) => <li key={item.id} aria-current={item.id === state.stage ? "step" : undefined}><span>{index + 1}</span>{item.label}<span className="sr-only">{index < step ? ": completed" : index === step ? ": current step" : ": upcoming"}</span></li>)}
        </ol>
        <div className={styles.workspace}>
          <aside className={styles.stack} aria-label="Sample evidence">
            <SampleImage eager caption="Synthetic sample reused from the public preview. Not an uploaded photograph or actual incident evidence." />
            <div className={styles.panel}>
              <p className={styles.eyebrow}>{DEMO_REPORT.id}</p>
              <h2>{DEMO_REPORT.title}</h2>
              <dl className={styles.metadata}><div><dt>Source</dt><dd>Seeded synthetic illustration</dd></div><div><dt>Location</dt><dd>Illustrative coordinates only</dd></div><div><dt>Trust</dt><dd>Not real emergency information</dd></div></dl>
            </div>
          </aside>
          <section className={styles.panel} aria-labelledby="demo-stage-heading">
            <p className={styles.eyebrow}>Step {step + 1} of 4 · {STEPS[step].label}</p>
            <h2 id="demo-stage-heading" ref={heading} tabIndex={-1}>{TITLES[state.stage]}</h2>
            {state.stage === "report" && <div className={styles.stack}>
              <p>A real report begins with a photo and a supplied or explicitly unknown location. For this walkthrough, use the built-in fictional sample.</p>
              <fieldset className={styles.choices}><legend>Choose a demonstration scenario</legend>
                <label><input type="radio" name="scenario" checked={!unavailable} onChange={() => dispatch({ type: "scenario", scenario: "sample-analysis" })} />Sample observation available</label>
                <label><input type="radio" name="scenario" checked={unavailable} onChange={() => dispatch({ type: "scenario", scenario: "ai-unavailable" })} />AI unavailable · manual review</label>
              </fieldset>
              <p>No file picker is needed: your private photos never enter this simulation.</p>
              <Button variant="primary" onClick={() => dispatch({ type: "submit" })}>Use sample report <ArrowRight size={18} aria-hidden="true" /></Button>
            </div>}
            {state.stage === "observation" && <div className={styles.stack}>
              {unavailable ? <div className={styles.notice}><h3>AI unavailable · sample fallback</h3><p>No model observation or confidence is available. The sample remains ready for manual review; missing analysis does not become a fabricated result.</p></div> : <>
                <div className={styles.notice}><strong>Prewritten sample · Not Meta-generated output</strong><p>The real integration requests structured observations from Muse Spark 1.3. No inference runs here.</p></div>
                <h3>Visible evidence</h3><ul>{DEMO_REPORT.observations.map((text) => <li key={text}>{text}</li>)}</ul>
                <h3>Unknowns</h3><ul>{DEMO_REPORT.uncertainties.map((text) => <li key={text}>{text}</li>)}</ul>
                <dl className={styles.metadata}><div><dt>English summary</dt><dd>{DEMO_REPORT.summary}</dd></div><div><dt>Draft Tagalog</dt><dd lang="tl">{DEMO_REPORT.summaryTl}</dd></div></dl>
              </>}
              <p>SAM 3.1 is an optional live reviewer tool. This walkthrough does not generate masks or imitate successful segmentation.</p>
              <Button variant="primary" onClick={() => dispatch({ type: "review" })}>Continue to sample review <ArrowRight size={18} aria-hidden="true" /></Button>
            </div>}
            {state.stage === "review" && <ReviewForm onDecision={(decision) => dispatch({ type: "decide", decision })} />}
            {state.stage === "map" && state.decision && <div className={styles.stack}>
              <p role="status" className={styles.notice}>{confirmed ? "Simulated confirmation saved. One sample appears in the reviewed index." : "Simulated rejection saved. No sample is published to the reviewed index."}</p>
              <SampleMap confirmed={confirmed} />
              <h3>Sample reviewed index</h3>
              {confirmed ? <p data-testid="demo-reviewed-report"><strong>{DEMO_REPORT.title}</strong><br />Simulated human confirmation · {DEMO_REPORT.id}<br />No real incident has been verified.</p> : <p data-testid="demo-empty-index">No confirmed samples. A rejected report stays out of this index.</p>}
              <h3>Local simulation history</h3>
              <ol className={styles.history}><li>{DEMO_REPORT.reporter} selected seeded evidence.</li><li>{unavailable ? "AI unavailable; manual review preserved." : "Prewritten sample observation displayed; no model call."}</li><li>{DEMO_REPORT.reviewer}: {confirmed ? "confirmed visible observation" : "rejected sample"}.<blockquote>{state.decision.note}</blockquote></li></ol>
              <p>This local history demonstrates provenance. It is not a persisted audit record.</p>
              <Button variant="primary" onClick={() => dispatch({ type: "reset" })}><RotateCcw size={18} aria-hidden="true" />Run another walkthrough</Button>
            </div>}
          </section>
        </div>
        <footer className={styles.footer}><p>Decision support only. No dispatch, location verification or live inference. For real authorized reports, use the signed-in workspace.</p><Button href="/login">Sign in to real workspace</Button></footer>
      </main>
    </div>
  );
}
