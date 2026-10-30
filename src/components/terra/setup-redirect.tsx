// src/components/terra/setup-redirect.tsx
//
// Server component that redirects to /login when Supabase is not
// configured. Used by the (app) layout so protected routes don't
// render a broken shell in the sandbox (no Supabase project).

import { redirect } from "next/navigation";

export function SetupRedirect() {
  redirect("/login");
  // redirect() throws, so this component never returns JSX.
  // The return is here to satisfy the type checker.
  return null;
}
