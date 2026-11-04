import type { Metadata } from "next";
import { ForgotPasswordContent } from "./ForgotPasswordContent";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return <ForgotPasswordContent
    configured={isSupabaseConfigured()}
    invalidLink={params.error === "invalid_link"}
  />;
}
