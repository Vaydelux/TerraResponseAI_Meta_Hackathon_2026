"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui-tr";
import { RecoveryFrame } from "@/components/auth/RecoveryFrame";
import { updateRecoveredPasswordAction, type UpdatePasswordState } from "@/lib/auth/recovery-actions";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/registration-policy";
import Link from "next/link";

export function ResetPasswordContent({ verified }: { verified: boolean }) {
  const [state, submit, pending] = useActionState<UpdatePasswordState, FormData>(
    updateRecoveredPasswordAction, null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <RecoveryFrame
      eyebrow="Secure password reset"
      title="Choose a new password"
      description="Set a unique password for your TerraResponse AI account. This will not alter your existing reports."
    >
      {!verified ? (
        <div role="alert" className="field__error" style={{ display: "grid", gap: "var(--s-3)" }}>
          <p>This page requires a valid password recovery link from your email.</p>
          <Link href="/forgot-password" style={{ textDecoration: "underline" }}>Request a new reset link</Link>
        </div>
      ) : (
        <form action={submit} aria-busy={pending} style={{ display: "grid", gap: "var(--s-4)" }}>
          {state?.error && <p role="alert" className="field__error">{state.error}</p>}
          <div className="auth-doctrine-box">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Your recovery link was verified. You can now replace your password.</span>
          </div>
          <Field label="New password" htmlFor="new-password"
            hint={`Use ${PASSWORD_MIN}–${PASSWORD_MAX} characters. Avoid common passwords and your email name.`}>
            <div style={{ position: "relative" }}>
              <LockKeyhole size={16} aria-hidden="true"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
              <Input id="new-password" name="password" type={showPassword ? "text" : "password"}
                autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
                disabled={pending} style={{ paddingLeft: 38, paddingRight: 46 }} />
              <button type="button" disabled={pending} onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "Hide new password" : "Show new password"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 6 }}>
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-new-password">
            <div style={{ position: "relative" }}>
              <LockKeyhole size={16} aria-hidden="true"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
              <Input id="confirm-new-password" name="confirmation"
                type={showConfirmation ? "text" : "password"} autoComplete="new-password"
                required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
                disabled={pending} style={{ paddingLeft: 38, paddingRight: 46 }} />
              <button type="button" disabled={pending} onClick={() => setShowConfirmation(v => !v)}
                aria-label={showConfirmation ? "Hide confirmation" : "Show confirmation"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 6 }}>
                {showConfirmation ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </Field>
          <Button type="submit" variant="primary" size="lg" block busy={pending} disabled={pending}>
            {pending ? "Updating password…" : "Save new password"}
          </Button>
        </form>
      )}
    </RecoveryFrame>
  );
}
