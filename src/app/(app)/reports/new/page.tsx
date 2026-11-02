// A report is evidence, not an event. The shared intake is assigned by
// the server for every authenticated user, independently of the event picker.
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { EmptyState } from "@/components/ui-tr";
import { ensureCommunityIntakeMembership } from "@/lib/community/intake";

export default async function UploadPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports/new"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");
  try {
    // Never resolve the upload target from a browser cookie or a selected event.
    await ensureCommunityIntakeMembership(user.id);
  } catch {
    return <div className="tr-page"><EmptyState
      title="Photo reporting temporarily unavailable"
      description="Your account is signed in, but the reporting service cannot accept photos right now. Please try again or contact the administrator."
    /></div>;
  }
  return <UploadFlow />;
}
