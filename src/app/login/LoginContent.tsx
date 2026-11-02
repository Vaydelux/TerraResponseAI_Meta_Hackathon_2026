"use client";

// src/app/login/LoginContent.tsx
//
// The client form for /login. Uses the new design-system components
// (Button, Field, Input) + the existing signInAction server action.

import { useState, useActionState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Field, Input } from "@/components/ui-tr";
import { Wordmark } from "@/components/layout/Wordmark";
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
      // Read the server-set Supabase cookies on a fresh protected request.
      // Avoid unhandled redirect exceptions in a client-wrapped form action.
      window.location.replace(redirectTo);
    }
  }, [redirectTo]);

  if (!configured) {
    return <SetupState />;
  }

  const urlError = params.get("error") === "auth_callback_failed";

  return (
    <div className="tr-shell" style={{ minHeight: "100dvh" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
      </header>
      <main id="main-content" tabIndex={-1} style={{ display: "grid", placeItems: "center", padding: "var(--s-7) var(--s-4)" }}>
        <div style={{ width: "100%", maxWidth: 420, display: "grid", gap: "var(--s-5)" }}>
          <header style={{ display: "grid", gap: "var(--s-2)", justifyItems: "center", textAlign: "center" }}>
            <Wordmark />
            <p className="t-meta">Decision-support prototype — human review required</p>
          </header>
          <div className="panel">
            <h1 style={{ fontSize: "var(--step-2)" }}>Sign in</h1>
            <p className="t-meta" style={{ marginTop: "var(--s-2)", marginBottom: "var(--s-4)" }}>
              Use your registered email address and password to continue.
            </p>
            {(pending || redirectTo) && <AuthLoadingBanner mode="login" />}
            <form action={formAction} aria-busy={pending || Boolean(redirectTo)} style={{ display: "grid", gap: "var(--s-3)" }}>
              {(state?.error || urlError) && (
                <div role="alert" className="field__error" style={{ padding: "var(--s-2)", background: "var(--brick-wash)", borderRadius: "var(--r-ctl)" }}>
                  {state?.error ?? "Email verification failed. Please try signing in again."}
                </div>
              )}
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <Field label="Email address" htmlFor="email">
                <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" aria-describedby="login-email-hint" placeholder="you@example.com" required disabled={pending || Boolean(redirectTo)} />
              </Field>
              <p id="login-email-hint" className="t-meta" style={{ marginTop: "calc(var(--s-2) * -1)" }}>
                Enter the email used at registration, not your display username.
              </p>
              <Field label="Password" htmlFor="password">
                <div style={{ position: "relative" }}>
                  <Input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={pending || Boolean(redirectTo)}
                    style={{ paddingRight: 48 }}
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
                      padding: 4,
                    }}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>
              <Button type="submit" variant="primary" block busy={pending || Boolean(redirectTo)} disabled={pending || Boolean(redirectTo)}>
                {pending || redirectTo ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="t-meta" style={{ marginTop: "var(--s-4)", textAlign: "center" }}>
              New to TerraResponse? <Link href="/signup" style={{ textDecoration: "underline" }}>Create an account</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function SetupState() {
  return (
    <div className="tr-shell" style={{ minHeight: "100dvh" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
      </header>
      <main id="main-content" tabIndex={-1} style={{ display: "grid", placeItems: "center", padding: "var(--s-7) var(--s-4)" }}>
        <div style={{ width: "100%", maxWidth: 480, display: "grid", gap: "var(--s-5)" }}>
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
    </div>
  );
}
