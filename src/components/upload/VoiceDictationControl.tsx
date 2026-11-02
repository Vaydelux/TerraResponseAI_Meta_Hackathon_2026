"use client";

// src/components/upload/VoiceDictationControl.tsx
//
// Microphone-based voice-to-text dictation control for the Description
// field in the report upload form (`UploadFlow.tsx`).
//
// Styled with unified `.voice-dictation` classes from components.css
// and canonical design tokens (`--ink`, `--rule`, `--sheet`, `--amber`).

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

export interface VoiceDictationControlProps {
  /** Callback invoked with the transcribed text to append to Description. */
  onTranscript: (text: string) => void;
  /** Disable dictation while form is submitting. */
  disabled?: boolean;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not encode audio."));
      }
    };
    reader.onerror = () => reject(new Error("Error reading audio recording."));
    reader.readAsDataURL(blob);
  });
}

export function VoiceDictationControl({
  onTranscript,
  disabled = false,
}: VoiceDictationControlProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [livePreview, setLivePreview] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalSpeechTextRef = useRef<string>("");
  const interimSpeechTextRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const cleanupRecordingResources = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.onresult = null;
        speechRecRef.current.onerror = null;
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
    };
  }, [cleanupRecordingResources]);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setLivePreview("");
    setElapsedSeconds(0);
    finalSpeechTextRef.current = "";
    interimSpeechTextRef.current = "";
    audioChunksRef.current = [];
    cancelledRef.current = false;

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();

    if (SpeechRecognitionCtor) {
      try {
        const rec = new SpeechRecognitionCtor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.onresult = (event: SpeechRecognitionResultEvent) => {
          let finalTranscript = "";
          let interimTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res[0]?.transcript) {
              if (res.isFinal) {
                finalTranscript += res[0].transcript + " ";
              } else {
                interimTranscript += res[0].transcript;
              }
            }
          }
          finalSpeechTextRef.current = finalTranscript.trim();
          interimSpeechTextRef.current = interimTranscript.trim();
          const combined = [finalSpeechTextRef.current, interimSpeechTextRef.current]
            .filter(Boolean)
            .join(" ");
          setLivePreview(combined);
        };
        rec.onerror = () => {
          // Non-fatal if MediaRecorder is active
        };
        rec.start();
        speechRecRef.current = rec;
      } catch {
        // Ignore SpeechRecognition init error; MediaRecorder will still run
      }
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const preferredMime =
          typeof MediaRecorder !== "undefined" &&
          typeof MediaRecorder.isTypeSupported === "function"
            ? MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : MediaRecorder.isTypeSupported("audio/mp4")
                ? "audio/mp4"
                : ""
            : "";

        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const browserFallback = [
            finalSpeechTextRef.current,
            interimSpeechTextRef.current,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          const chunks = [...audioChunksRef.current];
          const mimeType = recorder.mimeType || "audio/webm";
          cleanupRecordingResources();

          if (cancelledRef.current) {
            setIsRecording(false);
            setIsTranscribing(false);
            setLivePreview("");
            return;
          }

          setIsRecording(false);

          if (chunks.length === 0) {
            if (browserFallback) {
              onTranscript(browserFallback);
              setStatusMessage("Voice note added to description.");
            } else {
              setErrorMessage("No audio captured. Please speak clearly into the microphone.");
            }
            setLivePreview("");
            return;
          }

          setIsTranscribing(true);
          try {
            const audioBlob = new Blob(chunks, { type: mimeType });
            const audioBase64 = await blobToBase64(audioBlob);
            const res = await fetch("/api/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioBase64, mimeType }),
            });
            const data = await res.json();
            if (res.ok && data.ok && typeof data.transcript === "string" && data.transcript.trim()) {
              onTranscript(data.transcript.trim());
              setStatusMessage("Voice dictation transcribed into description.");
            } else if (browserFallback) {
              onTranscript(browserFallback);
              setStatusMessage("Voice dictation added to description.");
            } else {
              setErrorMessage(
                data?.error?.message ??
                  "Could not transcribe audio clip. Please try again or type directly.",
              );
            }
          } catch {
            if (browserFallback) {
              onTranscript(browserFallback);
              setStatusMessage("Voice dictation added to description.");
            } else {
              setErrorMessage("Transcription request failed. Check microphone or connection.");
            }
          } finally {
            setIsTranscribing(false);
            setLivePreview("");
          }
        };

        recorder.start(250);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        timerRef.current = setInterval(() => {
          setElapsedSeconds((prev) => prev + 1);
        }, 1000);
        return;
      } catch (err) {
        if (!speechRecRef.current) {
          cleanupRecordingResources();
          setErrorMessage(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Microphone permission was denied. Enable microphone access in browser settings."
              : "Could not access microphone on this device.",
          );
          return;
        }
      }
    }

    if (speechRecRef.current) {
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setErrorMessage("Voice input is not supported in this browser environment.");
    }
  }, [cleanupRecordingResources, onTranscript]);

  const stopRecording = useCallback(() => {
    cancelledRef.current = false;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      return;
    }
    const transcript = [
      finalSpeechTextRef.current,
      interimSpeechTextRef.current,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    cleanupRecordingResources();
    setIsRecording(false);
    setLivePreview("");
    if (transcript) {
      onTranscript(transcript);
      setStatusMessage("Voice dictation added to description.");
    } else {
      setErrorMessage("No speech detected. Try speaking closer to the microphone.");
    }
  }, [cleanupRecordingResources, onTranscript]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingResources();
      setIsRecording(false);
      setLivePreview("");
    }
  }, [cleanupRecordingResources]);

  return (
    <div className="voice-dictation" data-testid="voice-dictation-control">
      <div className="voice-dictation__toolbar">
        {!isRecording ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void startRecording()}
            disabled={disabled || isTranscribing}
            data-testid="voice-dictate-button"
            aria-label="Dictate situational description with microphone"
            aria-pressed={false}
          >
            {isTranscribing ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                <span>Transcribing voice note…</span>
              </>
            ) : (
              <>
                <Mic size={14} aria-hidden="true" />
                <span>Voice Dictation</span>
              </>
            )}
          </button>
        ) : (
          <div className="tr-cluster">
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={stopRecording}
              data-testid="voice-dictate-stop-button"
              aria-label="Stop recording and transcribe voice note"
              aria-pressed={true}
            >
              <Square size={12} aria-hidden="true" />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                Stop & Transcribe ({formatDuration(elapsedSeconds)})
              </span>
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={cancelRecording}
              data-testid="voice-dictate-cancel-button"
              aria-label="Cancel voice recording"
            >
              <X size={14} aria-hidden="true" />
              <span>Cancel</span>
            </button>
          </div>
        )}

        {statusMessage && !isRecording && !isTranscribing ? (
          <span
            className="voice-dictation__status"
            data-testid="voice-dictate-status"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>{statusMessage}</span>
          </span>
        ) : null}
      </div>

      {/* Live recording banner */}
      {isRecording ? (
        <div
          role="status"
          aria-live="polite"
          className="voice-dictation__banner"
          data-testid="voice-recording-banner"
        >
          <div className="voice-dictation__banner-row">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Mic size={14} aria-hidden="true" />
              <span>Recording audio — dictate situational details clearly</span>
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
          {livePreview ? (
            <p
              className="voice-dictation__preview"
              data-testid="voice-live-preview"
            >
              “{livePreview}”
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Error message */}
      {errorMessage ? (
        <div
          role="alert"
          className="voice-dictation__error"
          data-testid="voice-dictate-error"
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </div>
  );
}
