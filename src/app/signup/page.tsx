import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SignUpContent } from "./SignUpContent";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  // Server-only check: NEVER send SUPABASE_SERVICE_ROLE_KEY into the client.
  return <SignUpContent configured={isSupabaseConfigured()} />;
}
