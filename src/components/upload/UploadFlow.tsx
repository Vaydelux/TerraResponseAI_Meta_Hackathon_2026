// src/components/upload/UploadFlow.tsx
//
// The three-step upload flow (components.css §7.8):
//
//   Step 1: Choose photo (.dropzone + .filecheck validation list)
//   Step 2: Confirm location (.location-confirm)
//   Step 3: Submit (.upload-progress + StatusTimeline + COPY.postUpload)
//
// Manages the step state via `useState`. On submit, shows the
// StatusTimeline + the COPY.postUpload line: "Your photo is waiting
// for a reviewer. Nothing has been sent to emergency services."
//
// Per the brief: "Manages the step state. On submit, shows the
// StatusTimeline + COPY.postUpload."
//
// Client component — multi-step state + the upload XHR.

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Dropzone } from "./Dropzone";
import { FileCheckList, type FileCheckItem } from "./FileCheckList";
import { LocationConfirm, type LocationChoice } from "./LocationConfirm";
import { UploadProgress } from "./UploadProgress";
import { StatusTimeline } from "@/components/report/StatusTimeline";
import { PageHeader } from "@/components/layout/PageHeader";
import { Field, Input, Textarea, Button, toast } from "@/components/ui-tr";
import { COPY } from "@/lib/design/copy";

type Step = 1 | 2 | 3;

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "duplicate"; existingReportId: string }
  | { kind: "success"; reportId: string }
  | { kind: "error"; message: string };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface UploadFlowProps {
  /** The active event id (from the cookie set by EventSwitcher). */
  eventId?: string | null;
  className?: string;
}

export function UploadFlow({ eventId, className }: UploadFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [checks, setChecks] = useState<FileCheckItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationChoice, setLocationChoice] = useState<LocationChoice | null>(null);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [exif, setExif] = useState<{ lat: number; lon: number; capturedAt?: string | null } | null>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  function handleFiles(next: File[]) {
    setFiles(next);
    setChecks(next.map((f) => ({ name: f.name, state: "wait" as const, size: f.size })));
    setStep(1);

    // The server validates each file on the first upload attempt;
    // we don't claim a file is valid before that. We do a quick
    // client-side sanity check (size limit) so the user gets early
    // feedback, but the official verdict is server-side.
    setTimeout(() => {
      setChecks((prev) =>
        prev.map((c) => {
          const f = next.find((f) => f.name === c.name);
          if (!f) return c;
          if (f.size > 25 * 1024 * 1024) {
            return { ...c, state: "fail" as const, message: "over 25 MB" };
          }
          if (!/^image\/(jpeg|png)$/.test(f.type)) {
            return { ...c, state: "fail" as const, message: "not JPEG or PNG" };
          }
          return { ...c, state: "ok" as const, message: "valid image — final check on submit" };
        }),
      );
    }, 250);
  }

  function canProceedToStep2(): boolean {
    return files.length > 0 && checks.every((c) => c.state === "ok");
  }

  function onConfirmLocation(choice: LocationChoice, coords?: { lat: number; lon: number }) {
    setLocationChoice(choice);
    if (coords) setLocationCoords(coords);
    else setLocationCoords(null);
    setStep(3);
  }

  function buildMeta(linkToReportId?: string): Record<string, unknown> {
    const meta: Record<string, unknown> = {
      eventId: eventId ?? readCookie("tr-active-event"),
      title: title || undefined,
      description: description || undefined,
    };
    if (locationChoice === "manual" && locationCoords) {
      meta.latitude = locationCoords.lat;
      meta.longitude = locationCoords.lon;
      meta.locationSource = "manual";
    } else if (locationChoice === "unknown") {
      meta.locationSource = "unknown";
    } else if (locationChoice === "gps") {
      meta.locationSource = "gps";
    }
    if (linkToReportId) meta.linkToReportId = linkToReportId;
    return meta;
  }

  async function doUpload(linkToReportId?: string) {
    const file = files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("meta", JSON.stringify(buildMeta(linkToReportId)));

    setState({ kind: "uploading", progress: 0 });
    try {
      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", "/api/reports");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setState({ kind: "uploading", progress: Math.round((ev.loaded / ev.total) * 100) });
          }
        };
        xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.send(fd);
      });

      const body = await res.json();
      if (!res.ok) {
        if (body?.error?.code === "DUPLICATE" && body?.error?.existingReportId) {
          setState({ kind: "duplicate", existingReportId: body.error.existingReportId });
          return;
        }
        setState({ kind: "error", message: body?.error?.message ?? "Upload failed." });
        toast.error(body?.error?.message ?? "Upload failed.", {
          label: "Retry",
          onClick: () => void doUpload(linkToReportId),
        });
        return;
      }
      setState({ kind: "success", reportId: body.reportId });
      toast.success("Upload complete. The AI is now reading your photo.");
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "aborted") {
        setState({ kind: "idle" });
        return;
      }
      setState({ kind: "error", message: "Network error during upload." });
      toast.error("Network error during upload.");
    } finally {
      xhrRef.current = null;
    }
  }

  function cancelUpload() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setState({ kind: "idle" });
  }

  if (!eventId) {
    return (
      <div className="tr-page">
        <PageHeader title="Upload a photo" subtitle="Submit a disaster photo for AI analysis and human review." />
        <div className="panel">
          <p className="t-meta">Select an incident event above (top bar) before uploading.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <PageHeader title="Upload a photo" subtitle="Three steps: choose a photo, confirm the location, submit for review." />

      <div className="steps" aria-label="Upload steps">
        <span className="steps__item" data-done={(step > 1) || undefined} aria-current={step === 1 ? "step" : undefined}>
          1. Choose photo
        </span>
        <span className="steps__item" data-done={(step > 2) || undefined} aria-current={step === 2 ? "step" : undefined}>
          2. Confirm location
        </span>
        <span className="steps__item" aria-current={step === 3 ? "step" : undefined}>
          3. Submit
        </span>
      </div>

      {step === 1 && (
        <div className="tr-stack">
          <Dropzone onFiles={handleFiles} disabled={state.kind === "uploading"} />
          {checks.length > 0 && <FileCheckList items={checks} />}
          <Field label="Title (optional)" htmlFor="up-title">
            <Input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Flooded road near Brgy San Roque" />
          </Field>
          <Field label="Description (optional)" htmlFor="up-desc">
            <Textarea id="up-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <div className="tr-cluster" style={{ justifyContent: "flex-end" }}>
            <Button
              variant="primary"
              onClick={() => setStep(2)}
              disabled={!canProceedToStep2()}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <LocationConfirm
          exif={exif}
          onConfirm={onConfirmLocation}
        />
      )}

      {step === 3 && (
        <div className="tr-stack">
          {state.kind === "idle" && (
            <>
              <div className="panel">
                <h3 style={{ fontSize: "var(--step-1)", marginBottom: "var(--s-2)" }}>Ready to submit</h3>
                <ul className="t-meta" style={{ display: "grid", gap: 4 }}>
                  <li>Photo: {files[0]?.name}</li>
                  <li>Title: {title || "(none)"}</li>
                  <li>Location: {locationChoice === "unknown" ? "unknown" : locationChoice === "manual" ? "manual placement" : "from GPS EXIF"}</li>
                </ul>
              </div>
              <div className="tr-cluster">
                <Button variant="quiet" onClick={() => setStep(2)}>Back</Button>
                <Button variant="primary" onClick={() => void doUpload()}>Submit for review</Button>
              </div>
            </>
          )}
          {state.kind === "uploading" && (
            <div className="panel">
              <UploadProgress value={state.progress} label="Uploading photo…" />
              <Button variant="quiet" onClick={cancelUpload} style={{ marginTop: "var(--s-3)" }}>Cancel</Button>
            </div>
          )}
          {state.kind === "duplicate" && (
            <div className="panel">
              <h3 style={{ fontSize: "var(--step-1)" }}>Already uploaded</h3>
              <p className="t-meta" style={{ marginTop: "var(--s-2)" }}>
                A report with the same image already exists. Open it, or submit anyway as a linked report.
              </p>
              <div className="tr-cluster" style={{ marginTop: "var(--s-3)" }}>
                <Link className="btn" href={`/reports/${state.existingReportId}`}>Open existing report</Link>
                <Button variant="primary" onClick={() => void doUpload(state.existingReportId)}>Submit as linked</Button>
              </div>
            </div>
          )}
          {state.kind === "error" && (
            <div className="panel">
              <h3 style={{ fontSize: "var(--step-1)" }}>Upload failed</h3>
              <p className="t-meta" style={{ marginTop: "var(--s-2)" }}>{state.message}</p>
              <Button variant="primary" onClick={() => void doUpload()} style={{ marginTop: "var(--s-3)" }}>Retry</Button>
            </div>
          )}
          {state.kind === "success" && (
            <div className="tr-stack">
              <div className="panel">
                <h3 style={{ fontSize: "var(--step-2)" }}>Upload received</h3>
                <p style={{ marginTop: "var(--s-2)" }}>{COPY.postUpload}</p>
                <div className="tr-cluster" style={{ marginTop: "var(--s-3)" }}>
                  <Link className="btn btn--primary" href={`/reports/${state.reportId}`}>Open the report</Link>
                  <Button variant="quiet" onClick={() => {
                    setStep(1);
                    setFiles([]);
                    setChecks([]);
                    setState({ kind: "idle" });
                    setTitle("");
                    setDescription("");
                    setLocationChoice(null);
                    setLocationCoords(null);
                  }}>Upload another</Button>
                </div>
              </div>
              <StatusTimeline status="uploaded" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
