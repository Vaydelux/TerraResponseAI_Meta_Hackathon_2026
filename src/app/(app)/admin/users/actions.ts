"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireServerUser } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/profile";
import { adminRoleDatabase, isRoleManagementEnabled } from "@/lib/admin/role-management";

const schema=z.object({
  userId:z.string().uuid(),
  role:z.enum(["reporter","reviewer","admin"]),
});

export async function assignUserRole(form: FormData): Promise<void> {
  if(!isRoleManagementEnabled()) redirect("/dashboard");
  const user=await requireServerUser();
  const ctx=await getAuthContext(user);
  if(!ctx||ctx.user.role!=="admin") redirect("/dashboard");
  const parsed=schema.safeParse({
    userId:form.get("userId"),
    role:form.get("role"),
  });
  if(!parsed.success||parsed.data.userId===user.id) {
    redirect("/admin/users?result=invalid");
  }

  // Rechecked by a role-aware transactional PostgreSQL function under
  // an advisory lock: no self changes, no last-admin demotion, audit.
  const { data, error } = await adminRoleDatabase().rpc("assign_app_role",{
    p_actor:user.id,
    p_target:parsed.data.userId,
    p_new_role:parsed.data.role,
  });
  if(error||!data?.ok) {
    console.error("[admin] Role mutation denied or unavailable",error?.code??"unknown");
    redirect("/admin/users?result=failed");
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?result=updated");
}
