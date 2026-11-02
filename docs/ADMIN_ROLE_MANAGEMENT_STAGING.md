# Staging admin role management

The **User roles** page is visible only to authenticated global admins when `REPORT_FIRST_ROLE_MANAGEMENT_ENABLED=true`. The feature is **OFF in Production** until staging acceptance passes.

The role-setting form calls a Next.js server action, checks a verified Supabase user, checks the current database profile role, then uses a server-held Supabase service-role key to call the revocation-protected PostgreSQL RPC `public.assign_app_role`. All account permissions are taken from `public.profiles.role` rather than user-editable metadata.

The RPC:
- Requires current caller's profile to be global admin.
- Rejects attempts to change own role.
- Refuses removing the last administrator.
- Uses a global transaction advisory lock and target row lock to protect concurrent role changes.
- Changes role and event memberships in one transaction.
- Downgrades elevated event memberships when reducing a user's role.
- Sets community event membership appropriately after promotion.
- Appends an `audit_events` record and notifies all global admins, without including passwords or original photos.
- Cannot be executed directly by `anon` or `authenticated`, only server-only `service_role` with a verified admin session.

## Required verification

1. Apply source migration `20261103122000_admin_role_management.sql` to isolated staging `ytfaetqvtbsbmcsdlkvk`, never production.
2. Verify `anon=false`, `authenticated=false`, `service_role=true` EXECUTE grants.
3. Test reporter calling the route directly (denied) and admin promoting a staging Reporter to Reviewer and demoting back. Use test identities only, preserve QA account passwords.
4. Verify reporter->reviewer grants community event Reviewer membership, and demotion removes old elevated memberships. Confirm the change and audit occur together.
5. Test admin changing own role (denied), last-admin demotion (denied), concurrent role changes, invalid roles and missing user.
6. Add `REPORT_FIRST_ROLE_MANAGEMENT_ENABLED=true` in Vercel **Preview only**, redeploy Preview, log in with the staging admin QA account, and open `/admin/users`.
7. Verify no role can access other users via `/admin/users` unless admin. Require real browser checks before production promotion.

**Important:** Staging Auth Admin-created sample users do not exist in Production. Production must not receive the role-management SQL until its separate migration rollout and security testing are approved.
