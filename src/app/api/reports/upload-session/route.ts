import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ensureCommunityIntakeMembership } from "@/lib/community/intake";
import { checkUserUploadRate } from "@/lib/rate-limit";
import { createDirectUploadGrant } from "@/lib/upload/direct-upload-token";

export async function POST() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Supabase is not configured." } }, { status: 503 });
  let user;
  try { user = await requireServerUser(); } catch { return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 }); }
  if (!await getAuthContext(user)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Profile not found." } }, { status: 401 });
  const rate = await checkUserUploadRate(user.id);
  if (!rate.ok) return NextResponse.json({ error: { code: rate.code, message: rate.message } }, { status: rate.code === "USER_UPLOAD_RATE_UNAVAILABLE" ? 503 : 429 });
  let eventId: string;
  try { eventId = await ensureCommunityIntakeMembership(user.id); } catch { return NextResponse.json({ error: { code: "INTAKE_UNAVAILABLE", message: "Photo reporting is temporarily unavailable." } }, { status: 503 }); }
  const reportId = randomUUID();
  const path = `${eventId}/${reportId}.jpg`;
  let grant: string;
  try { grant = createDirectUploadGrant({ userId: user.id, eventId, reportId, path }); } catch { return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Direct upload is not configured." } }, { status: 503 }); }
  return NextResponse.json({ ok: true, reportId, eventId, bucket: "evidence-originals", path, grant, expiresInSeconds: 900 });
}
