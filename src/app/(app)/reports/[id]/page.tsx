// src/app/(app)/reports/[id]/page.tsx
//
// The report detail page. Read-only — uses the ReviewWorkbench
// with `readOnly={true}` so the action bar isn't rendered. The
// reviewer's review action lives at /review/[id] (the workbench).
//
// The page also renders the EvidencePurgeDialog launcher (the
// contributor or an admin can request evidence deletion — the
// 7-day retention rule).

import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { ReviewWorkbench } from "@/components/review/ReviewWorkbench";
import { EvidencePurgeLauncher } from "./EvidencePurgeLauncher";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/login");
  const { id } = await params;

  return (
    <>
      <ReviewWorkbench
        reportId={id}
        readOnly
        currentUserId={user.id}
        currentUserDisplayName={ctx.user.name}
        currentUserRole={ctx.user.role}
      />
      <EvidencePurgeLauncher reportId={id} currentRole={ctx.user.role} />
    </>
  );
}
