import type { Metadata } from "next";
import { cookies } from "next/headers";
import { RECOVERY_COOKIE_NAME } from "@/lib/auth/password-recovery";
import { ResetPasswordContent } from "./ResetPasswordContent";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const verified = cookieStore.get(RECOVERY_COOKIE_NAME)?.value === "verified";
  return <ResetPasswordContent verified={verified} />;
}
