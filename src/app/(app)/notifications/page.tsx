import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { PageHeader } from "@/components/layout/PageHeader";
import { isTriageEnabled } from "@/lib/triage/processing";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

export const metadata = { title: "Notifications | TerraResponse AI" };

export default async function NotificationsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?callbackUrl=%2Fnotifications");
  const ctx = await getAuthContext(user);
  if (!ctx) redirect("/account-unavailable");

  // Reporters receive future feedback notifications; all admin
  // transactions and moderator queues are delivered to their own inbox.
  if (!isTriageEnabled()) {
    return <section className="tr-page">
      <PageHeader title="Notifications" subtitle="Notification center" />
      <div className="panel"><p>Community incident notifications are not enabled in this environment.</p></div>
    </section>;
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("notifications")
    .select("id,kind,title,body,created_at,read_at,report_id")
    .eq("recipient_id",user.id)
    .order("created_at",{ ascending:false })
    .limit(100);
  return <section className="tr-page">
    <PageHeader title="Notifications" subtitle="Audit-linked incident and moderation activity visible to your account."/>
    {!error && (data ?? []).some(n => !n.read_at) && <form action={markAllNotificationsRead}>
      <button className="btn" type="submit">Mark all as read</button>
    </form>}
    {error ? <div className="panel" role="alert">Notifications could not be loaded. Please retry.</div> :
      (data ?? []).length===0 ? <div className="panel"><p>No notifications yet.</p></div> :
      <div className="tr-stack">
        {(data ?? []).map(n=><article key={n.id} className="panel" aria-label={n.kind.replaceAll("_"," ")}>
          <h2 style={{ fontSize:"var(--step-1)" }}>{n.title}</h2>
          <p className="t-meta">{n.body}</p>
          <p className="t-meta">{new Date(n.created_at).toLocaleString()} · {n.read_at ? "Read":"Unread"}</p>
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10}}>
            {n.report_id && <Link href={`/reports/${n.report_id}`} className="btn">Open report</Link>}
            {!n.read_at && <form action={markNotificationRead}>
              <input type="hidden" name="notificationId" value={n.id}/>
              <button className="btn" type="submit">Mark as read</button>
            </form>}
          </div>
        </article>)}
      </div>}
  </section>;
}
