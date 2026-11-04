type ReportInsert = { id?: unknown; creator_id?: unknown };
type DatabaseWebhookPayload = { type?: unknown; table?: unknown; schema?: unknown; record?: ReportInsert };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(reportId: string, actorId: string, timestamp: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = `${timestamp}.${reportId}.${actorId}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return `${timestamp}.${base64Url(new Uint8Array(signature))}`;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const suppliedSecret = request.headers.get("x-terra-database-webhook-secret") ?? "";
  if (!constantTimeEqual(suppliedSecret, env("DATABASE_WEBHOOK_SECRET"))) return json({ error: "unauthorized" }, 401);

  const payload = await request.json().catch(() => null) as DatabaseWebhookPayload | null;
  const record = payload?.record;
  const reportId = typeof record?.id === "string" ? record.id : "";
  const actorId = typeof record?.creator_id === "string" ? record.creator_id : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (payload?.type !== "INSERT" || payload.schema !== "public" || payload.table !== "reports" || !uuid.test(reportId) || !uuid.test(actorId)) {
    return json({ error: "invalid_report_insert_payload" }, 400);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(reportId, actorId, timestamp, env("ANALYSIS_WEBHOOK_SECRET"));
  const appUrl = env("APP_ANALYSIS_URL").replace(/\/$/, "");
  const response = await fetch(`${appUrl}/api/reports/${reportId}/analyze`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "x-terra-analysis-signature": signature },
    body: JSON.stringify({ actorId }),
  });

  if (!response.ok && response.status !== 409) return json({ error: "analysis_dispatch_failed", upstreamStatus: response.status }, 502);
  return json({ ok: true, reportId, dispatched: response.status !== 409 });
});
