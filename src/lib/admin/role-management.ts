import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";

export function isRoleManagementEnabled() {
  return process.env.REPORT_FIRST_ROLE_MANAGEMENT_ENABLED === "true";
}

/** Server-only credential. Call after verifying the actor's JWT+admin role. */
export function adminRoleDatabase() {
  const url=supabaseUrl(), key=serviceRoleKey();
  if(!url||!key) throw new Error("Admin role service is not configured.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
