// src/app/(app)/reports/new/page.tsx
//
// The upload page. Uses the new UploadFlow component (which reads
// the active event from the cookie + manages the three-step state).

import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UploadFlow } from "@/components/upload/UploadFlow";
import { EmptyState } from "@/components/ui-tr";
import { ensureCommunityIntakeMembership, isCommunityIntakeEnabled } from "@/lib/community/intake";

export default async function UploadPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports/new"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  // New reporters use the server-selected community intake.
  // Existing event-specific workflows retain their membership checks.
  let activeEventId: string | null = null;
  if (isCommunityIntakeEnabled()) {
    try {
      activeEventId = await ensureCommunityIntakeMembership(user.id);
    } catch {
      return <div className="tr-page"><EmptyState title="Community reporting unavailable" description="The reporting workspace is temporarily unavailable. Please try again later." /></div>;
    }
  } else {
    const cookieStore = await cookies();
    const cookieId = cookieStore.get("tr-active-event")?.value;
    activeEventId = cookieId && ctx.events.some((e) => e.event_id === cookieId)
      ? cookieId : ctx.events[0]?.event_id ?? null;
  }

  if (!activeEventId) {
    return (
      <div className="tr-page">
        <EmptyState
          title="Reporting is not configured"
          description="Community intake is not enabled yet, and no authorized event is available."
        />
      </div>
    );
  }

  return <UploadFlow eventId={activeEventId} />;
}
