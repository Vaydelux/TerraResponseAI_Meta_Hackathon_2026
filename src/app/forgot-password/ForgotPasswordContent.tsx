"use client";

import { useActionState } from "react";
import { Mail, Send, CheckCircle2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui-tr";
import { RecoveryFrame } from "@/components/auth/RecoveryFrame";
import { requestPasswordResetAction, type RequestResetState } from "@/lib/auth/recovery-actions";

const initial: RequestResetState = { status: "idle" };

export function ForgotPasswordContent({ configured, invalidLink }: {
  configured: boolean;
  invalidLink: boolean;
}) {
  const [state, submit, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <RecoveryFrame
      eyebrow="Account recovery"
      title="Forgot your password?"
      description="Enter the email address linked to your account. We'll send a secure link so you can choose a new password."
    >
      {invalidLink && (
        <p role="alert" className="field__error">Your recovery link has expired or is invalid. Request a new one below.</p>
      )}
      {!configured ? (
        <p role="alert" className="field__error">Password recovery is temporarily unavailable.</p>
      ) : state.status === "sent" ? (
        <div className="auth-doctrine-box" role="status" aria-live="polite">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <strong>Check your inbox</strong>
            <p>If an account exists for that address, a password reset email will arrive shortly.
              Check your spam folder too. You may need to wait before requesting another email.</p>
          </div>
        </div>
      ) : (
        <form action={submit} aria-busy={pending} style={{ display: "grid", gap: "var(--s-4)" }}>
          {state.error && <p role="alert" className="field__error">{state.error}</p>}
          <Field label="Email address" htmlFor="recovery-email"
            hint="Use your registered email address, not your display username.">
            <div style={{ position: "relative" }}>
              <Mail size={16} aria-hidden="true"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-3)" }} />
              <Input id="recovery-email" name="email" type="email" autoComplete="email"
                inputMode="email" placeholder="you@example.com" required maxLength={254}
                disabled={pending} style={{ paddingLeft: 38 }} />
            </div>
          </Field>
          <Button type="submit" variant="primary" size="lg" block busy={pending} disabled={pending}>
            {pending ? "Requesting reset link…" : <><Send size={16} aria-hidden="true" /> Send reset link</>}
          </Button>
        </form>
      )}
    </RecoveryFrame>
  );
}
