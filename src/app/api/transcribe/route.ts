// src/app/api/transcribe/route.ts
//
// POST /api/transcribe — server-side voice-to-text transcription for
// field responder audio notes using @google/genai (`gemini-3.5-transcribe`).
//
// Keeps GEMINI_API_KEY strictly on the server and enforces bounded audio
// payload size.

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024; // ~7.5 MB binary audio limit
const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

export async function POST(request: NextRequest) {
  let body: { audioBase64?: unknown; mimeType?: unknown };
  try {
    body = (await request.json()) as { audioBase64?: unknown; mimeType?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON payload." } },
      { status: 400 },
    );
  }

  const rawBase64 = typeof body.audioBase64 === "string" ? body.audioBase64.trim() : "";
  if (!rawBase64) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Missing audioBase64 data." } },
      { status: 400 },
    );
  }

  // Strip optional data URL prefix (e.g. "data:audio/webm;base64,...")
  const commaIdx = rawBase64.indexOf(",");
  const cleanBase64 = commaIdx >= 0 ? rawBase64.slice(commaIdx + 1) : rawBase64;

  if (cleanBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Audio clip exceeds maximum size limit.",
        },
      },
      { status: 413 },
    );
  }

  const rawMime =
    typeof body.mimeType === "string" && body.mimeType.trim().length > 0
      ? body.mimeType.trim().split(";")[0]
      : "audio/webm";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "GEMINI_API_KEY is not configured on the server.",
        },
      },
      { status: 503 },
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const response = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: rawMime,
            data: cleanBase64,
          },
        },
        {
          text: "Transcribe this field responder situational report audio accurately. Output only the spoken transcript without extra commentary or markdown.",
        },
      ],
    });

    const transcript = (response.text ?? "").trim();
    return NextResponse.json({
      ok: true,
      transcript,
      modelId: TRANSCRIBE_MODEL,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "TRANSCRIPTION_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "Failed to transcribe audio clip.",
        },
      },
      { status: 502 },
    );
  }
}
