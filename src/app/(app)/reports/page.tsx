// Report-first: a user's authorized reports are not restricted to a
// selected event. Supabase RLS still governs record visibility.
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportList } from "@/components/report/ReportList";
import { Button } from "@/components/ui-tr";

export default async function ReportsPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/reports"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  return (
    <div className="tr-page">
      <PageHeader
        title="Your reports"
        subtitle="See submissions and their verification status. Reports do not require you to select a disaster event."
        actions={<Button variant="primary" href="/reports/new">Upload a photo</Button>}
      />
      <ReportList
        limit={100}
        emptyTitle="No photos submitted yet"
        emptyDescription="You can report a possible hazard now, even before an event has been declared."
      />
    </div>
  );
}
