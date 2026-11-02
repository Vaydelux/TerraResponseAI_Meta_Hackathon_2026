// Reviewers and administrators can moderate their RLS-authorized reports
// across workspaces without choosing an event in the navigation bar.
import { getServerUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReviewQueueTable } from "@/components/review/ReviewQueueTable";

export default async function ReviewPageRoute() {
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=" + encodeURIComponent("/review"));
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");
  if (ctx.user.role !== "reviewer" && ctx.user.role !== "admin") {
    redirect("/dashboard");
  }
  return (
    <div className="tr-page">
      <PageHeader
        title="Review queue"
        subtitle="Review only the evidence your role is authorized to moderate. AI findings remain provisional until reviewed."
      />
      <ReviewQueueTable />
    </div>
  );
}
