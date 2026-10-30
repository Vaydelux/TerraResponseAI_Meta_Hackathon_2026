// src/app/login/page.tsx
//
// Email + password sign-in via Supabase. Replaces the shadcn-heavy
// form with the new design-system components (Button, Field, Input).
// The page is a Server Component shell that renders either the
// sign-in form (when Supabase is configured) or the setup state.
//
// The form's action is the existing `signInAction` server action.
// `useSearchParams` is wrapped in <Suspense> per Next.js requirement.

import { Suspense } from "react";
import { LoginContent } from "./LoginContent";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="tr-shell" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
          <p className="t-meta">Loading…</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
