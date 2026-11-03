// A report is evidence, not an event. The shared intake is assigned by
// the server for every authenticated user, independently of the event picker.
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { EmptyState } from "@/components/ui-tr";
import { ensureCommunityIntakeMembership, COMMUNITY_INTAKE_SLUG } from "@/lib/community/intake";

export default async function UploadPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports/new"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");
  if (!ctx.events.some((e) => e.event_slug === COMMUNITY_INTAKE_SLUG &&
      e.event_status === "active")) {
    try {
      // A first-time reporter is enrolled through a fixed server-owned
      // event only; returning members should not incur another write.
      await ensureCommunityIntakeMembership(user.id);
    } catch {
      return <div className="tr-page"><EmptyState
        title="Photo reporting temporarily unavailable"
        description="Your account is signed in, but the reporting service cannot accept photos right now. Please try again or contact the administrator."
      /></div>;
    }
  }
  return <UploadFlow />;
}
