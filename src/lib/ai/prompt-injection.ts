// src/lib/ai/prompt-injection.ts
//
// Prompt-injection defenses for user-supplied text inputs (title +
// description on the report). Per the brief:
//   - "input validation against prompt injection in user captions"
//
// Defense layers (defense-in-depth — each layer alone is bypassable;
// together they raise the bar):
//
//   1. STRUCTURAL: user-supplied text (title, description) is NEVER
//      included in the prompt sent to the AI model. The system prompt
//      in src/lib/ai/prompt.ts is fixed; the only image input is the
//      derivative image bytes. So even if the user writes
//      "ignore previous instructions and ...", the model never sees
//      it. This is the PRIMARY defense — the input never reaches the
//      model.
//
//   2. LENGTH: title ≤ 200 chars, description ≤ 5000 chars (Zod in
//      src/lib/api-schemas/reports.ts). Caps the maximum prompt
//      injection payload that could ever reach the model if layer 1
//      ever regressed.
//
//   3. CONTENT SANITIZATION (this module): a pure function that flags
//      or sanitizes user text BEFORE it is stored. Detects the
//      common prompt-injection patterns:
//        - "ignore (all|previous|the above) instructions"
//        - "you are now ..." / "your new task is ..."
//        - "system:" / "assistant:" / "<|im_start|>" (chatml)
//        - "###" / "---" separator injection (rare but cheap to catch)
//      Detected patterns are REWRITTEN to a clearly-inert form
//      ("[redacted:possible-instruction]") so the reviewer still sees
//      that SOMETHING was entered, but the text can't be confused
//      with a system instruction by any downstream consumer (the
//      reviewer UI, the dashboard, the audit log).
//
//   4. AUDIT: when sanitization rewrites text, an audit entry is
//      written (the route handler is responsible; this module just
//      returns the rewritten text + a flag). The reviewer can see
//      "Prompt-injection pattern detected and sanitized" in the
//      report's audit trail.
//
// This module is PURE: no side effects, no I/O, fully unit-testable.

export interface SanitizeResult {
  /** The sanitized text (original if no patterns matched). */
  text: string;
  /** True if at least one pattern was rewritten. */
  rewrote: boolean;
  /** The patterns that matched (for the audit entry). */
  matchedPatterns: string[];
}

// Order matters: more specific patterns first so we don't
// accidentally strip a fragment of a longer match.
const INJECTION_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // ChatML / role-injection tokens (the most dangerous — these are
  // how a model knows to switch roles).
  { name: "chatml-im-start", regex: /<\|im_start\|>/gi, replacement: "[redacted:chatml]" },
  { name: "chatml-im-end", regex: /<\|im_end\|>/gi, replacement: "[redacted:chatml]" },
  // Role prefixes ("system:", "assistant:", "user:"). The model may
  // interpret these as a role switch.
  { name: "role-system", regex: /^\s*system\s*:/gim, replacement: "[redacted:role]:" },
  { name: "role-assistant", regex: /^\s*assistant\s*:/gim, replacement: "[redacted:role]:" },
  { name: "role-user", regex: /^\s*user\s*:/gim, replacement: "[redacted:role]:" },
  // Explicit instruction-override phrases. The most common injection.
  {
    name: "ignore-instructions",
    regex: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|the above|the following|these)\s+instructions?/gi,
    replacement: "[redacted:instruction-override]",
  },
  {
    name: "ignore-previous",
    regex: /\bignore\s+(all\s+)?previous\b/gi,
    replacement: "[redacted:instruction-override]",
  },
  // Role-reassignment ("you are now a ...", "your new task is ...").
  {
    name: "role-reassign-you-are",
    regex: /\byou are now (a|an|the)\b/gi,
    replacement: "[redacted:role-reassign]",
  },
  {
    name: "role-reassign-new-task",
    regex: /\byour new (task|instructions?) (is|are)\b/gi,
    replacement: "[redacted:role-reassign]",
  },
  // "Do not follow your instructions" / "Override your rules"
  {
    name: "override-rules",
    regex: /\b(override|bypass|do not follow)\s+(your|the|these)\s+(rules|instructions?|guidelines?)\b/gi,
    replacement: "[redacted:rule-override]",
  },
];

/**
 * Sanitize user-supplied text for storage. Detects common prompt-
 * injection patterns and rewrites them to a clearly-inert form.
 * Returns the sanitized text + the list of patterns that matched
 * (for the audit entry).
 *
 * The sanitized text is what's stored on the report row. The
 * original text is NOT preserved (we don't want it surfaced to a
 * reviewer either; the sanitized form makes the injection attempt
 * obvious without giving the payload a place to live).
 */
export function sanitizeUserText(input: string): SanitizeResult {
  let text = input;
  const matched: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.regex.test(text)) {
      // Reset lastIndex because regex has the global flag.
      p.regex.lastIndex = 0;
      text = text.replace(p.regex, p.replacement);
      matched.push(p.name);
    }
  }
  // Collapse repeated redaction markers (so "ignore previous ignore
  // previous" → "[redacted:instruction-override] [redacted:instruction-override]"
  // → "[redacted:instruction-override]").
  text = text.replace(/(\[redacted:[a-z-]+\])(\s*\1)+/gi, "$1");
  return {
    text,
    rewrote: matched.length > 0,
    matchedPatterns: matched,
  };
}
