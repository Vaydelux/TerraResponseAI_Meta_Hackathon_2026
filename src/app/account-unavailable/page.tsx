// A recoverable destination for a verified user whose RLS-scoped
// profile is not yet readable. Public to avoid auth redirect loops;
// never expose account data, roles or internal database errors here.
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Wordmark } from "@/components/layout/Wordmark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { signOutAction } from "@/lib/auth/actions";

export const metadata = {
  title: "Account access temporarily unavailable | TerraResponse",
  robots: { index: false, follow: false },
};

export default function AccountUnavailablePage() {
  return (
    <div className="tr-shell" style={{ gridTemplateRows: "var(--nav-h) 1fr auto", minHeight: "100dvh" }}>
      <header className="topbar">
        <Wordmark href="/" />
        <div className="topbar__spacer" />
        <ThemeToggle />
      </header>

      <main style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <section
          role="alert"
          className="panel"
          style={{ maxWidth: 500, width: "100%", display: "grid", gap: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--amber-wash)",
                color: "var(--amber-ink)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={20} />
            </span>
            <div>
              <span className="t-meta num" style={{ color: "var(--amber-ink)", fontWeight: 700 }}>
                RLS PROFILE GATE · STANDBY
              </span>
              <h1 style={{ fontSize: "var(--step-2)", margin: 0 }}>
                Account access temporarily unavailable
              </h1>
            </div>
          </div>

          <p className="t-meta" style={{ margin: 0, lineHeight: 1.6 }}>
            Your profile or event permissions could not be loaded. This does not necessarily mean
            your email or password is wrong. Please retry, or contact the administrator if it persists.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              paddingTop: 8,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <Link className="btn btn--primary" href="/dashboard">
              Retry dashboard
            </Link>
            <form action={signOutAction}>
              <button className="btn" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="tr-status-footer">
        <span>TerraResponse AI · Geospatial Emergency Verification Platform</span>
        <span>Human-Supervised Verification Architecture · RLS-Enforced</span>
      </footer>
    </div>
  );
}
