"use client";

// src/app/login/LoginContent.tsx
//
// User-friendly, responsive split-panel sign-in portal for /login.
// Preserves all Supabase SSR authentication actions, safe callback
// validation, and accessibility states while providing the
// Human-Reviewed Doctrine sidebar and Day / Night Ops theme switching.

import { useState, useActionState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Lock, Eye, EyeOff, ArrowRight, KeyRound, Mail, CheckCircle2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui-tr";
import { Wordmark } from "@/components/layout/Wordmark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AuthLoadingBanner } from "@/components/auth/AuthLoadingBanner";
import { safeAuthPath } from "@/lib/auth/safe-redirect";
import { signInAction, type SignInState } from "@/lib/auth/actions";

export function LoginContent({ configured }: { configured: boolean }) {
  const params = useSearchParams();

  const [showPw, setShowPw] = useState(false);

  const cbParam = params.get("callbackUrl");
  const callbackUrl = safeAuthPath(cbParam ?? "/dashboard");

  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    async (_prev, fd) => signInAction(fd),
    null,
  );
  const redirectTo = state?.redirectTo;

  useEffect(() => {
    if (redirectTo) {
      window.location.replace(redirectTo);
    }
  }, [redirectTo]);

  if (!configured) {
    return <SetupState />;
  }

  const urlError = params.get("error") === "auth_callback_failed";

  return (
    <div className="tr-shell" style={{ minHeight: "100dvh", gridTemplateRows: "var(--nav-h) 1fr auto" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
        <div className="topbar__spacer" />
        <span className="topbar__desktop-only t-meta" style={{ fontWeight: 600 }}>
          <ShieldCheck size={15} aria-hidden="true" style={{ color: "var(--tide)" }} />
          Human-Verified Disaster Intelligence
        </span>
        <ThemeToggle />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        style={{ display: "grid", placeItems: "center", padding: "clamp(16px, 4vw, 40px) clamp(12px, 3vw, 24px)" }}
      >
        <div className="auth-portal">
          {/* Left Column: Friendly Overview & Human-Reviewed Guarantee */}
          <aside className="auth-portal__aside" aria-label="Platform overview">
            <div style={{ display: "grid", gap: "var(--s-4)" }}>
              <div
                className="t-meta"
                style={{
                  fontWeight: 700,
                  color: "var(--amber-ink)",
                  background: "var(--amber-wash)",
                  border: "1px dashed var(--amber)",
                  padding: "4px 10px",
                  borderRadius: "var(--r-ctl)",
                  justifySelf: "start",
                }}
              >
                Human-Supervised AI Workflow
              </div>
              <Wordmark />
              <h2 style={{ fontSize: "var(--step-2)", lineHeight: 1.2 }}>
                Turn field disaster photos into verified incident reports.
              </h2>
              <p className="t-meta" style={{ fontSize: "var(--step-0)", lineHeight: 1.55 }}>
                Upload ground or aerial photos, let AI organize key observations,
                and rely on human reviewers to confirm every report before it appears on the live map.
              </p>

              <div className="auth-portal__media">
                <img
                  src="/demo/flood-aerial.png"
                  alt="Aerial flood intelligence preview"
                  referrerPolicy="no-referrer"
                />
                <div className="auth-portal__media-bar">
                  <span>Flood Assessment Preview</span>
                  <span style={{ background: "var(--tide)", color: "#fff", padding: "2px 8px", borderRadius: 4 }}>
                    Human-Reviewed
                  </span>
                </div>
              </div>

              <div className="auth-doctrine-box">
                <CheckCircle2 size={18} aria-hidden="true" style={{ marginTop: 2 }} />
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Always Verified by a Person</strong>
                  <span>
                    AI predictions stay clearly marked as unverified (amber hatch) until an authorized reviewer confirms or corrects them.
                  </span>
                </div>
              </div>
            </div>

            <div
              className="t-meta"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                paddingTop: "var(--s-3)",
                borderTop: "1px solid var(--rule)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Lock size={13} aria-hidden="true" />
                Encrypted Supabase Session
              </span>
              <span>Role-Scoped Access</span>
            </div>
          </aside>

          {/* Right Column: Sign In Form (Ordered first on mobile) */}
          <section className="auth-portal__main" aria-labelledby="login-heading">
            <div>
              <div className="t-meta" style={{ fontWeight: 600, color: "var(--tide)", marginBottom: 4 }}>
                Welcome back
              </div>
              <h1 id="login-heading" style={{ fontSize: "var(--step-2)" }}>
                Sign in to your account
              </h1>
              <p className="t-meta" style={{ marginTop: "var(--s-1)" }}>
                Enter your registered email address and password to continue to the workspace.
              </p>
            </div>

            {(pending || redirectTo) && <AuthLoadingBanner mode="login" />}

            <form
              action={formAction}
              aria-busy={pending || Boolean(redirectTo)}
              style={{ display: "grid", gap: "var(--s-4)" }}
            >
              {(state?.error || urlError) && (
                <div
                  role="alert"
                  className="field__error"
                  style={{
                    padding: "var(--s-3)",
                    background: "var(--brick-wash)",
                    border: "1px solid var(--brick)",
                    borderRadius: "var(--r-ctl)",
                  }}
                >
                  {state?.error ?? "Email verification failed. Please try signing in again."}
                </div>
              )}

              <input type="hidden" name="callbackUrl" value={callbackUrl} />

              <Field label="Email address" htmlFor="email">
                <div style={{ position: "relative" }}>
                  <Mail
                    size={16}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--ink-3)",
                      pointerEvents: "none",
                    }}
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    aria-describedby="login-email-hint"
                    placeholder="you@example.com"
                    required
                    disabled={pending || Boolean(redirectTo)}
                    style={{ paddingLeft: 38 }}
                  />
                </div>
              </Field>
              <p id="login-email-hint" className="t-meta" style={{ marginTop: "calc(var(--s-3) * -1)" }}>
                Use the email address you registered with (not your display username).
              </p>

              <Field label="Password" htmlFor="password">
                <div style={{ position: "relative" }}>
                  <KeyRound
                    size={16}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--ink-3)",
                      pointerEvents: "none",
                    }}
                  />
                  <Input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    disabled={pending || Boolean(redirectTo)}
                    style={{ paddingLeft: 38, paddingRight: 48 }}
                  />
                  <button
                    type="button"
                    disabled={pending || Boolean(redirectTo)}
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: 0,
                      color: "var(--ink-3)",
                      cursor: "pointer",
                      padding: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {showPw ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </Field>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                busy={pending || Boolean(redirectTo)}
                disabled={pending || Boolean(redirectTo)}
              >
                {pending || redirectTo ? (
                  "Signing in…"
                ) : (
                  <>
                    Sign in to Workspace
                    <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <div
              style={{
                paddingTop: "var(--s-3)",
                borderTop: "1px solid var(--rule)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "var(--s-2)",
              }}
            >
              <p className="t-meta">
                New to TerraResponse?{" "}
                <Link href="/signup" style={{ color: "var(--tide)", fontWeight: 600, textDecoration: "underline" }}>
                  Create an account
                </Link>
              </p>
              <Link href="/" className="t-meta" style={{ textDecoration: "underline" }}>
                ← Back to home
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="tr-status-footer">
        <span>TerraResponse AI · Disaster-Photo Intelligence</span>
        <span>Human-Verified Workflow · Day &amp; Night Ops</span>
      </footer>
    </div>
  );
}

function SetupState() {
  return (
    <div className="tr-shell" style={{ minHeight: "100dvh", gridTemplateRows: "var(--nav-h) 1fr auto" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
        <div className="topbar__spacer" />
        <ThemeToggle />
      </header>
      <main id="main-content" tabIndex={-1} style={{ display: "grid", placeItems: "center", padding: "var(--s-7) var(--s-4)" }}>
        <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: "var(--s-5)" }}>
          <header style={{ display: "grid", gap: "var(--s-2)", justifyItems: "center", textAlign: "center" }}>
            <Wordmark />
            <p className="t-meta">Decision-support prototype — human review required</p>
          </header>
          <div className="panel">
            <h1 style={{ fontSize: "var(--step-2)" }}>Setup required</h1>
            <p className="t-meta" style={{ marginTop: "var(--s-2)", marginBottom: "var(--s-4)" }}>
              Supabase is not configured. Set these environment variables to enable email authentication.
            </p>
            <ul style={{ display: "grid", gap: "var(--s-3)", padding: 0, margin: 0, listStyle: "none" }}>
              {[
                ["NEXT_PUBLIC_SUPABASE_URL", "Your Supabase project URL (https://<ref>.supabase.co)."],
                ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "The public anon key (safe for the browser; RLS is the boundary)."],
                ["SUPABASE_SERVICE_ROLE_KEY", "The service-role key — server-side only, never in the browser."],
              ].map(([k, v]) => (
                <li key={k} style={{ display: "grid", gap: 4 }}>
                  <code className="num" style={{ fontSize: "var(--step--1)" }}>{k}</code>
                  <span className="t-meta">{v}</span>
                </li>
              ))}
            </ul>
            <div className="well-uncertain" style={{ marginTop: "var(--s-4)" }}>
              <p className="t-meta">After sign-up, run the bootstrap procedure documented in the README — users cannot self-assign reviewer/admin.</p>
            </div>
          </div>
        </div>
      </main>
      <footer className="tr-status-footer">
        <span>TerraResponse AI · Setup Mode</span>
        <span>Human-Verified Workflow</span>
      </footer>
    </div>
  );
}
