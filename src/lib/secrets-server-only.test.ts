// src/lib/secrets-server-only.test.ts
//
// Security test: verifies that NO secret env var is exposed to the
// browser bundle. The Next.js convention: any env var prefixed with
// `NEXT_PUBLIC_` is inlined into the browser bundle at build time.
// Secrets MUST NOT be prefixed with `NEXT_PUBLIC_`.
//
// Per the brief: "Confirm secrets remain server-only; do not embed
// credential values in commits."
//
// This test scans the .env.example template + the source code for
// any reference to the secret env vars. The test fails if:
//   1. A secret env var name is prefixed with `NEXT_PUBLIC_` in
//      `.env.example` (a developer copying the template would
//      expose the secret).
//   2. The source code reads a secret env var via `process.env.
//      NEXT_PUBLIC_<SECRET>` (the var would be inlined).
//
// The test does NOT scan the actual `.env` file (it's gitignored +
// may contain real secret values; we don't want the test to read
// real secrets).
//
// The secrets list:
//   - MODEL_API_KEY (the Meta Model API key)
//   - SAM_API_KEY (the SAM 3.1 API key)
//   - SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
//   - NEXTAUTH_SECRET (signs the JWT session cookies)
//   - SUPABASE_DB_PASSWORD (if used; the Supabase DB password — not
//     read by the app but documented in DEPLOYMENT.md)
//
// DEMO_MODE is NOT a secret (it's a UI flag) — it's not in this
// list. NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
// are NOT secrets (they're public-by-design; RLS is the boundary).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const SECRETS = [
  "MODEL_API_KEY",
  "SAM_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXTAUTH_SECRET",
] as const;

const REPO_ROOT = resolve(__dirname, "../..");

function readEnvExample(): string {
  try {
    return readFileSync(resolve(REPO_ROOT, ".env.example"), "utf-8");
  } catch {
    return ""; // .env.example may not exist in some test contexts
  }
}

/** Recursively read all .ts/.tsx files under src/ (NOT node_modules
 *  or .next or the tests/fixtures). Returns the concatenated content
 *  so a single `toContain` check can scan the entire codebase. */
function readAllSourceFiles(): string {
  const srcDir = resolve(REPO_ROOT, "src");
  let content = "";
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        try {
          content += readFileSync(full, "utf-8");
        } catch {
          // skip unreadable files
        }
      }
    }
  }
  walk(srcDir);
  return content;
}

describe("secrets remain server-only (no NEXT_PUBLIC_ prefix on secrets)", () => {
  const envExample = readEnvExample();
  const sourceContent = readAllSourceFiles();

  for (const secret of SECRETS) {
    it(`.env.example does NOT define NEXT_PUBLIC_${secret}`, () => {
      // The .env.example should NOT have a line that starts with
      // NEXT_PUBLIC_<SECRET>=. A line that MENTIONS NEXT_PUBLIC_<SECRET>
      // in a comment is OK (e.g., explaining why it's NOT prefixed).
      // We check for a line that DEFINES the var (an assignment).
      const lines = envExample.split("\n");
      const definingLines = lines.filter(
        (line) =>
          line.trim().startsWith(`NEXT_PUBLIC_${secret}=`) ||
          line.trim().startsWith(`NEXT_PUBLIC_${secret} `),
      );
      expect(definingLines).toEqual([]);
    });

    it(`the source code (ALL .ts/.tsx files) does NOT read process.env.NEXT_PUBLIC_${secret}`, () => {
      // Scans ALL source files under src/ — not just a hand-picked
      // list. A secret leaked via any source file would be caught.
      // A reference in a comment is OK; a reference in code (the
      // literal string `process.env.NEXT_PUBLIC_<SECRET>`) is not.
      expect(sourceContent).not.toContain(`process.env.NEXT_PUBLIC_${secret}`);
    });
  }

  it("the .env.example documents the secrets as server-only", () => {
    // The .env.example should have a comment somewhere saying the
    // secrets are server-only (e.g., "Server-only" or "never expose
    // to the browser").
    expect(envExample).toContain("Server-only");
  });

  it("the .env.example does NOT contain real secret values (only empty quotes or placeholders)", () => {
    // The .env.example should NOT have a real secret value after
    // the = sign. Real secrets look like long base64/hex strings;
    // the template should have "" or a placeholder.
    for (const secret of SECRETS) {
      // Match lines like `SECRET="value"` or `SECRET=value`.
      const re = new RegExp(`^${secret}=["']?([^"']*)["']?\\s*$`, "m");
      const match = envExample.match(re);
      if (match) {
        const value = match[1];
        // The value should be empty OR a clearly-fake placeholder
        // (e.g., "<your-key>"). A real secret is typically 32+ chars
        // of base64/hex; we reject any value longer than 20 chars
        // that's not a placeholder.
        if (value.length > 0 && value.length > 20 && !value.startsWith("<")) {
          expect.fail(
            `${secret} in .env.example has a value that looks like a real secret (length ${value.length}): "${value.slice(0, 10)}…"`,
          );
        }
      }
    }
  });
});

describe("DEMO_MODE is NOT a secret (UI flag, server-only is fine but not required)", () => {
  const envExample = readEnvExample();
  it("DEMO_MODE is not in the SECRETS list (it's a UI flag)", () => {
    expect(SECRETS).not.toContain("DEMO_MODE");
  });

  it("DEMO_MODE is not prefixed with NEXT_PUBLIC_ in .env.example (it's read server-side only)", () => {
    // DEMO_MODE is read server-side only (the demo banner is a
    // server component). It's NOT a secret, but we don't expose it
    // to the browser either (no need).
    const lines = envExample.split("\n");
    const definingLines = lines.filter(
      (line) => line.trim().startsWith("NEXT_PUBLIC_DEMO_MODE="),
    );
    expect(definingLines).toEqual([]);
  });
});
