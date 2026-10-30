"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, Field, Input } from "@/components/ui-tr";
import { Wordmark } from "@/components/layout/Wordmark";
import { signUpAction, type SignUpState } from "@/lib/auth/actions";

const initialState: SignUpState = { status: "idle" };

export function SignUpContent({ configured }: { configured: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(
    async (_previous, fields) => signUpAction(fields),
    initialState,
  );

  return (
    <div className="tr-shell" style={{ minHeight: "100dvh" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
      </header>
      <main id="main-content" tabIndex={-1}
        style={{ display: "grid", placeItems: "center", padding: "var(--s-7) var(--s-4)" }}>
        <div style={{ width: "100%", maxWidth: 440, display: "grid", gap: "var(--s-5)" }}>
          <header style={{ display: "grid", gap: "var(--s-2)", textAlign: "center", justifyItems: "center" }}>
            <Wordmark />
            <p className="t-meta">Disaster-photo decision support · Human verification required</p>
          </header>
          <section className="panel" aria-labelledby="signup-heading">
            <h1 id="signup-heading" style={{ fontSize: "var(--step-2)" }}>Create an account</h1>
            <p className="t-meta" style={{ margin: "var(--s-2) 0 var(--s-4)" }}>
              Register as a contributor to submit evidence for authorized review.
              Reviewer and administrator access is assigned separately.
            </p>

            {!configured ? (
              <div role="alert" className="field__error">
                Registration is not configured on this deployment. Contact an administrator.
              </div>
            ) : state.status === "success" ? (
              <div role="status" aria-live="polite" style={{ display: "grid", gap: "var(--s-4)" }}>
                <p>{state.message}</p>
                <Link href="/login" className="btn btn--primary">
                  Return to sign in
                </Link>
              </div>
            ) : (
              <form action={formAction} style={{ display: "grid", gap: "var(--s-3)" }}>
                {state.status === "error" && (
                  <div role="alert" className="field__error" style={{ padding: "var(--s-2)", borderRadius: "var(--r-ctl)" }}>
                    {state.message}
                  </div>
                )}
                <Field label="Email" htmlFor="signup-email">
                  <Input id="signup-email" name="email" type="email" autoComplete="email"
                    placeholder="you@example.com" maxLength={254} required disabled={pending}
                    invalid={state.status === "error" && state.field === "email"} />
                </Field>
                <Field label="Password" htmlFor="signup-password"
                  hint="Use 12–72 characters. Choose a unique password.">
                  <Input id="signup-password" name="password" type={showPassword ? "text" : "password"}
                    autoComplete="new-password" minLength={12} maxLength={72} required disabled={pending}
                    invalid={state.status === "error" && state.field === "password"} />
                </Field>
                <Field label="Confirm password" htmlFor="signup-confirm-password">
                  <Input id="signup-confirm-password" name="confirmPassword" type={showPassword ? "text" : "password"}
                    autoComplete="new-password" minLength={12} maxLength={72} required disabled={pending} />
                </Field>
                <label className="t-meta" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", cursor: "pointer" }}>
                  <input type="checkbox" checked={showPassword} disabled={pending}
                    onChange={(event) => setShowPassword(event.target.checked)} />
                  Show passwords
                </label>
                <Button type="submit" variant="primary" block busy={pending} disabled={pending}>
                  {pending ? "Creating account…" : "Create account"}
                </Button>
                <p className="t-meta">
                  We may send an email verification link. Do not upload real incident evidence
                  until an authorized event has been assigned.
                </p>
              </form>
            )}
            <p className="t-meta" style={{ marginTop: "var(--s-4)", textAlign: "center" }}>
              Already registered? <Link href="/login" style={{ textDecoration: "underline" }}>Sign in</Link>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
