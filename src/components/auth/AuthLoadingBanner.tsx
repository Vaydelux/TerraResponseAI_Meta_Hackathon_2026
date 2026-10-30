"use client";

/**
 * Accessible action feedback. The progress line is indeterminate:
 * it does not claim a known completion percentage or that an email was sent.
 */
export function AuthLoadingBanner({ mode }: { mode: "login" | "signup" }) {
  const login = mode === "login";
  return (
    <div className="auth-progress" role="status" aria-live="polite" aria-atomic="true">
      <div className="auth-progress__mark" aria-hidden="true">
        <svg viewBox="0 0 36 36" width="28" height="28" fill="none">
          <path d="M4 14V4h10M22 4h10v10M32 22v10H22M14 32H4V22"
            stroke="currentColor" strokeWidth="2.7" strokeLinecap="round"/>
          <path d="M8 8h12v12H8z" fill="#DFAD59"/>
          <path d="m10 18 8-8" stroke="#795221" strokeWidth="2"/>
        </svg>
      </div>
      <div className="auth-progress__copy">
        <strong>{login ? "Securing your session" : "Submitting your registration"}</strong>
        <span>{login
          ? "Checking your credentials and permissions…"
          : "Validating your account details with Supabase…"}</span>
      </div>
      <span className="auth-progress__dots" aria-hidden="true"><i/><i/><i/></span>
      <span className="auth-progress__rail" aria-hidden="true"><span/></span>
    </div>
  );
}
