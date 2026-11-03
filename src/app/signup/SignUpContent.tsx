"use client";

// src/app/signup/SignUpContent.tsx
//
// User-friendly, responsive split-panel contributor registration
// portal for /signup. Preserves all registration security rules
// (username validation, passphrase checklist, contributor-only server
// action, zero role metadata promotion) while providing clear guidance.

import { useActionState, useState } from "react";
import Link from "next/link";
import { ShieldAlert, CheckCircle2, Layers, Radio, ArrowRight, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui-tr";
import { Wordmark } from "@/components/layout/Wordmark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AuthLoadingBanner } from "@/components/auth/AuthLoadingBanner";
import { USERNAME_HINT, passwordChecklist } from "@/lib/auth/registration-policy";
import { signUpAction, type SignUpState } from "@/lib/auth/actions";

const initialState: SignUpState = { status: "idle" };

export function SignUpContent({ configured }: { configured: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Safety acknowledgement must be an explicit user action, not an
  // implicit opt-in from a pre-checked control.
  const [agreedTerms, setAgreedTerms] = useState(false);

  const rules = passwordChecklist(password, username, email);
  const [state, formAction, pending] = useActionState<SignUpState, FormData>(
    async (_previous, fields) => signUpAction(fields),
    initialState,
  );

  return (
    <div className="tr-shell" style={{ minHeight: "100dvh", gridTemplateRows: "var(--nav-h) 1fr auto" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
        <div className="topbar__spacer" />
        <span className="topbar__desktop-only t-meta" style={{ fontWeight: 600 }}>
          <ShieldCheck size={15} aria-hidden="true" style={{ color: "var(--tide)" }} />
          Contributor Registration
        </span>
        <ThemeToggle />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        style={{ display: "grid", placeItems: "center", padding: "clamp(16px, 4vw, 40px) clamp(12px, 3vw, 24px)" }}
      >
        <div className="auth-portal">
          {/* Left Column: How Accounts & Verification Work */}
          <aside className="auth-portal__aside" aria-label="How TerraResponse works">
            <div style={{ display: "grid", gap: "var(--s-4)" }}>
              <div className="t-meta" style={{ fontWeight: 700, color: "var(--tide)" }}>
                Community &amp; Responder Onboarding
              </div>
              <h2 style={{ fontSize: "var(--step-2)", lineHeight: 1.2 }}>
                Join TerraResponse
              </h2>
              <p className="t-meta" style={{ fontSize: "var(--step-0)", lineHeight: 1.55 }}>
                Create a contributor account to submit disaster photos and help response teams prioritize verified field hazards.
              </p>

              <div className="auth-mandate-box">
                <ShieldAlert size={18} aria-hidden="true" style={{ marginTop: 2 }} />
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Human-Reviewed Safety Policy</strong>
                  <span>
                    Every AI analysis is treated as a draft until a human reviewer confirms it. New accounts start as Contributors; Reviewer and Admin roles are assigned by administrators.
                  </span>
                </div>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--s-3)" }}>
                <li style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "var(--s-3)", alignItems: "start" }}>
                  <span className="kpi-card__icon" style={{ width: 32, height: 32 }}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--step--1)" }}>Transparent Review History</div>
                    <div className="t-meta">Track your submitted photos from upload to human verification.</div>
                  </div>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "var(--s-3)", alignItems: "start" }}>
                  <span className="kpi-card__icon" style={{ width: 32, height: 32 }}>
                    <Layers size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--step--1)" }}>Assisted AI Image Analysis</div>
                    <div className="t-meta">Automatically highlights floodwater, debris, and structural damage for faster review.</div>
                  </div>
                </li>
                <li style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "var(--s-3)", alignItems: "start" }}>
                  <span className="kpi-card__icon" style={{ width: 32, height: 32 }}>
                    <Radio size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--step--1)" }}>Privacy &amp; 7-Day Evidence Control</div>
                    <div className="t-meta">Contributors can request evidence deletion after the retention window.</div>
                  </div>
                </li>
              </ul>

              <div className="auth-portal__media">
                <img
                  src="/demo/dashboard-reference.png"
                  alt="TerraResponse operations workbench preview"
                  referrerPolicy="no-referrer"
                />
                <div className="auth-portal__media-bar">
                  <span>Review Workbench</span>
                  <span>Human-in-the-Loop</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Column: Registration Form (Ordered first on mobile) */}
          <section className="auth-portal__main" aria-labelledby="signup-heading">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-2)", flexWrap: "wrap" }}>
              <div>
                <div className="t-meta" style={{ fontWeight: 600, color: "var(--tide)" }}>
                  Create Your Account
                </div>
                <h1 id="signup-heading" style={{ fontSize: "var(--step-2)", marginTop: 2 }}>
                  Contributor Registration
                </h1>
              </div>
              <span className="t-meta" style={{ padding: "3px 8px", borderRadius: 4, background: "var(--sheet-sunk)", border: "1px solid var(--rule)" }}>
                Free Contributor Access
              </span>
            </div>

            <p className="t-meta">
              Fill out the details below to create your contributor account.
              Reviewer and administrator permissions are granted separately by your event admin.
            </p>

            {!configured ? (
              <div role="alert" className="field__error">
                Registration is not configured on this deployment. Contact an administrator.
              </div>
            ) : state.status === "success" ? (
              <div role="status" aria-live="polite" style={{ display: "grid", gap: "var(--s-4)", padding: "var(--s-4)", background: "var(--green-wash)", border: "1px solid var(--green)", borderRadius: "var(--r-ctl)" }}>
                <p style={{ color: "var(--green-ink)", fontWeight: 600 }}>{state.message}</p>
                <Link href="/login" className="btn btn--primary">
                  Return to sign in
                </Link>
              </div>
            ) : (
              <>
                {pending && <AuthLoadingBanner mode="signup" />}
                <form action={formAction} aria-busy={pending} style={{ display: "grid", gap: "var(--s-3)" }}>
                  {state.status === "error" && (
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
                      {state.message}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "var(--s-3)" }}>
                    <Field
                      label="Username (Display Name)"
                      htmlFor="signup-username"
                      hint={`${USERNAME_HINT} Shown on your reports; you will sign in with your email.`}
                    >
                      <Input
                        id="signup-username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(event) => {
                          setUsernameEdited(true);
                          setUsername(event.target.value);
                        }}
                        minLength={3}
                        maxLength={24}
                        pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                        placeholder="e.g. field_reporter"
                        required
                        disabled={pending}
                        invalid={state.status === "error" && state.field === "username"}
                      />
                    </Field>

                    <Field
                      label="Email address"
                      htmlFor="signup-email"
                      hint="We will send a confirmation link to this address."
                    >
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => {
                          const value = event.target.value;
                          setEmail(value);
                          if (!usernameEdited) {
                            const guess = value
                              .split("@")[0]
                              .toLowerCase()
                              .replace(/[^a-z0-9_]/g, "_")
                              .replace(/^[^a-z]+/, "")
                              .slice(0, 24);
                            if (guess) setUsername(guess);
                          }
                        }}
                        placeholder="you@example.com"
                        maxLength={254}
                        required
                        disabled={pending}
                        invalid={state.status === "error" && state.field === "email"}
                      />
                    </Field>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "var(--s-3)" }}>
                    <Field
                      label="Password (12+ characters)"
                      htmlFor="signup-password"
                      hint="Use 12–72 characters. A memorable phrase works great."
                    >
                      <Input
                        id="signup-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={72}
                        placeholder="At least 12 characters"
                        required
                        disabled={pending}
                        invalid={state.status === "error" && state.field === "password"}
                      />
                    </Field>

                    <Field
                      label="Confirm password"
                      htmlFor="signup-confirm-password"
                      hint="Re-enter the same password to confirm."
                    >
                      <Input
                        id="signup-confirm-password"
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={72}
                        placeholder="Re-enter password"
                        required
                        disabled={pending}
                        invalid={state.status === "error" && state.field === "confirmPassword"}
                      />
                    </Field>
                  </div>

                  {/* Password strength meter + checklist */}
                  <div
                    className="t-meta"
                    aria-live="polite"
                    style={{
                      display: "grid",
                      gap: 6,
                      padding: "var(--s-3)",
                      background: "var(--sheet-sunk)",
                      borderRadius: "var(--r-ctl)",
                      border: "1px solid var(--rule)",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                      <span style={{ height: 4, borderRadius: 2, background: rules.length ? "var(--green)" : "var(--rule-strong)" }} />
                      <span style={{ height: 4, borderRadius: 2, background: rules.distinct ? "var(--green)" : "var(--rule-strong)" }} />
                      <span style={{ height: 4, borderRadius: 2, background: rules.notEmail ? "var(--green)" : "var(--rule-strong)" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)" }}>
                      <span>{rules.length ? "✓" : "○"} Between 12 and 72 characters</span>
                      <span>{rules.distinct ? "✓" : "○"} Does not contain your username</span>
                      <span>{rules.notEmail ? "✓" : "○"} Does not contain your email name</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--s-2)" }}>
                    <label className="t-meta" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={showPassword}
                        disabled={pending}
                        onChange={(event) => setShowPassword(event.target.checked)}
                      />
                      Show passwords
                    </label>
                    <label className="t-meta" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={agreedTerms}
                        disabled={pending}
                        onChange={(event) => setAgreedTerms(event.target.checked)}
                        required
                      />
                      I understand all AI observations require human review
                    </label>
                  </div>

                  <Button type="submit" variant="primary" size="lg" block busy={pending} disabled={pending}>
                    {pending ? (
                      "Creating account…"
                    ) : (
                      <>
                        Create account
                        <ArrowRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </Button>

                  <p className="t-meta">
                    Confirmation emails are rate-limited. Submit once; if you receive an email quota error, wait for the provider limit to reset rather than retrying repeatedly. Do not upload real incident evidence until an authorized event has been assigned.
                  </p>
                </form>
              </>
            )}

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
                Already registered?{" "}
                <Link href="/login" style={{ color: "var(--tide)", fontWeight: 600, textDecoration: "underline" }}>
                  Sign in
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
        <span>TerraResponse AI · Contributor Registration</span>
        <span>Human-Verified Workflow · Day &amp; Night Ops</span>
      </footer>
    </div>
  );
}
