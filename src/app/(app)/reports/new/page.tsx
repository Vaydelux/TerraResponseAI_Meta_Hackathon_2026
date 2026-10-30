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

export default async function UploadPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports/new"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login?callbackUrl=" + encodeURIComponent("/reports/new"));

  // Resolve the active event id from the cookie.
  const cookieStore = await cookies();
  const cookieId = cookieStore.get("tr-active-event")?.value;
  const activeEventId =
    cookieId && ctx.events.some((e) => e.event_id === cookieId)
      ? cookieId
      : ctx.events[0]?.event_id ?? null;

  if (!activeEventId) {
    return (
      <div className="tr-page">
        <EmptyState
          title="No event selected"
          description="Select an incident event in the top bar before uploading a photo."
        />
      </div>
    );
  }

  return <UploadFlow eventId={activeEventId} />;
}
