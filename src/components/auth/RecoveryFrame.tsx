import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/Wordmark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function RecoveryFrame({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="tr-shell" style={{ minHeight: "100dvh", gridTemplateRows: "var(--nav-h) 1fr auto" }}>
      <header className="topbar" style={{ position: "sticky", top: 0 }}>
        <Wordmark />
        <div className="topbar__spacer" />
        <span className="topbar__desktop-only t-meta" style={{ fontWeight: 600 }}>
          <ShieldCheck size={15} aria-hidden="true" style={{ color: "var(--tide)" }} />
          Secure account recovery
        </span>
        <ThemeToggle />
      </header>
      <main id="main-content" tabIndex={-1}
        style={{ display: "grid", placeItems: "center", padding: "clamp(16px,4vw,40px) clamp(12px,3vw,24px)" }}>
        <div className="auth-portal">
          <aside className="auth-portal__aside" aria-label="Account recovery information">
            <div style={{ display: "grid", gap: "var(--s-4)" }}>
              <div className="t-meta" style={{ fontWeight: 700, color: "var(--tide)" }}>
                TerraResponse AI · Account Security
              </div>
              <Wordmark />
              <h2 style={{ fontSize: "var(--step-2)", lineHeight: 1.2 }}>Protect your field reporting account.</h2>
              <p className="t-meta" style={{ lineHeight: 1.6 }}>
                Account recovery uses a time-limited email link through Supabase Authentication.
                Your reports and reviewer permissions remain unchanged.
              </p>
              <div className="auth-mandate-box" style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-3)" }}>
                <KeyRound size={20} aria-hidden="true" />
                <span>Only the owner of the email inbox can initiate a password reset.
                  We will never ask for your existing password by email.</span>
              </div>
            </div>
          </aside>
          <section className="auth-portal__main" aria-labelledby="recovery-heading">
            <div style={{ display: "grid", gap: "var(--s-2)" }}>
              <p className="t-meta" style={{ fontWeight: 600, color: "var(--tide)" }}>{eyebrow}</p>
              <h1 id="recovery-heading" style={{ fontSize: "var(--step-2)" }}>{title}</h1>
              <p className="t-meta">{description}</p>
            </div>
            {children}
            <div style={{ paddingTop: "var(--s-3)", borderTop: "1px solid var(--rule)" }}>
              <Link href="/login" className="t-meta" style={{ color: "var(--tide)", fontWeight: 600 }}>
                ← Back to sign in
              </Link>
            </div>
          </section>
        </div>
      </main>
      <footer className="t-meta" style={{ textAlign: "center", padding: "var(--s-4)" }}>
        TerraResponse AI · Human-verified disaster intelligence
      </footer>
    </div>
  );
}
