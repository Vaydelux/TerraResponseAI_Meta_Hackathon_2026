"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireServerUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { isTriageEnabled } from "@/lib/triage/processing";

const notificationId = z.string().uuid();

export async function markNotificationRead(form: FormData): Promise<void> {
  if (!isTriageEnabled()) return;
  const parsed = notificationId.safeParse(form.get("notificationId"));
  if (!parsed.success) return;

  const user = await requireServerUser();
  const db = await createSupabaseServerClient();
  // Both the explicit user predicate and notifications_mark_self_read RLS
  // prevent modifying someone else's read acknowledgement.
  const { error } = await db.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data).eq("recipient_id", user.id).is("read_at", null);
  if (error) throw new Error("Unable to mark your notification as read.");
  revalidateTag(`terraresponse:notifications:${user.id}`, "max");
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!isTriageEnabled()) return;
  const user = await requireServerUser();
  const db = await createSupabaseServerClient();
  const { error } = await db.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id).is("read_at", null);
  if (error) throw new Error("Unable to acknowledge notifications.");
  revalidateTag(`terraresponse:notifications:${user.id}`, "max");
  revalidatePath("/notifications");
}
