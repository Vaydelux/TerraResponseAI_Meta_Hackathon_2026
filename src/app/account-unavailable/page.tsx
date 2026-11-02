// A recoverable destination for a verified user whose RLS-scoped
// profile is not yet readable. Public to avoid auth redirect loops;
// never expose account data, roles or internal database errors here.
import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";

export const metadata = {
  title: "Account access temporarily unavailable | TerraResponse",
  robots: { index: false, follow: false },
};

export default function AccountUnavailablePage() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <section role="alert" className="panel" style={{ maxWidth: 460, width: "100%", display: "grid", gap: 16 }}>
        <h1>Account access temporarily unavailable</h1>
        <p>
          Your profile or event permissions could not be loaded. This does not necessarily mean
          your email or password is wrong. Please retry, or contact the administrator if it persists.
        </p>
        <Link className="btn" href="/dashboard">Retry dashboard</Link>
        <form action={signOutAction}>
          <button className="btn" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
