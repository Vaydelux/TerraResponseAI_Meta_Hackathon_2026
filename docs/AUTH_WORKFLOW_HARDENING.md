# TerraResponse AI — Authentication reliability and UX audit

## What the October 30 production logs actually established

1. A signup request failed with `email_address_invalid` (HTTP 400).
2. A subsequent request failed with `over_email_send_rate_limit` (HTTP 429). This is **the Supabase hosted email sender's shared quota**, NOT something a better email regex or username can solve.
3. Login failed **before** password verification because its pre-auth audit count query was unavailable.
4. Read-only SQL inspection of the connected Supabase project found `service_role` and `authenticated` have **no SELECT or INSERT privileges on any of the eight public application tables**, despite existing RLS policies. `audit_events` exists but has no grants. Privileges are necessary in addition to RLS policies.

## Fixes committed (requires migration deployment)

- Signup collects a 3–24 character username; an editable suggestion is derived from the email local part. It is an **unverified display handle**, not unique and **not** a valid sign-in credential. Auth email remains required. Account role and memberships stay database-controlled.
- Server and browser share email/username/password validation. Passwords must be 12–72 characters, avoid obvious common examples and not include the username/email name. Longer passphrases are accepted without arbitrary upper/lower/symbol composition rules. Supabase's own password policy remains authoritative.
- Login and signup use a branded, accessible **indeterminate** loading banner, which respects reduced-motion preferences and never claims model/database progress that the browser cannot measure.
- Signup messages distinguish SMTP email quota, email domain rejection, disabled signup and user-level throttling.
- The login audit check uses supported JSONB containment syntax and records a non-sensitive error code to support future troubleshooting; it continues to fail closed if its fraud-prevention store is unreachable.
- New **forward-only `0011_explicit_data_api_grants.sql`** makes PostgreSQL grants consistent with existing authenticated RLS policies and restores server-only access to the audit table. This is a **database privilege change**, not just UI code, and must be security-reviewed and applied to **staging first**.

## Actions still needed outside the code repository

**A. Supabase custom SMTP (mandatory for meaningful hosted signup tests):**
In the correct Supabase project, go to Authentication > Emails > SMTP Settings. Configure a verified sending domain and a trusted SMTP provider (Resend/Brevo/Postmark/SES etc.). Enable email confirmation, configure sender identity, and check SPF/DKIM/DMARC. Then set an appropriate limit in Authentication > Rate Limits and enable CAPTCHA/abuse protection. **Do not attempt to defeat provider throttling or turn off email confirmations.** Supabase's default hosted email provider permits only 2 emails per hour and restricts deliveries to team addresses. See https://supabase.com/docs/guides/auth/auth-smtp.

**B. Staging database migration:**
The connected database reports only `0001`, `0002` applied. GitHub already has a manual staging-only apply workflow. Review and apply `0003`–`0011` in order **only to a verified staging target** with the authorized DB owner; this may affect storage policies, triggers, RPC grants and RLS. Do not apply to the public production database simply to dismiss login errors.
After apply, check `has_table_privilege('service_role','public.audit_events','SELECT')`, `has_table_privilege('authenticated','public.profiles','SELECT')`, and validate RLS with real separate user JWTs. Run Supabase advisors and review DDL.

**C. Login/auth acceptance tests:**
On staging: register using a real authorized email; verify one confirmation email, callback exchange, reporter profile and saved username. Check login with correct, wrong and unconfirmed credentials; user rate-limit/fail-closed behavior; protected routes; sign out and refresh; no self-appointed reviewer/admin; and keyboard/mobile/reduced-motion UX. Test provider quota response without retries or real email spam.

## Username sign-in limitation

Supabase email/password auth does not authenticate by username directly. Safe username sign-in requires **a unique username column in the database and a carefully rate-limited, enumeration-resistant identifier resolver**. This PR deliberately does not impersonate email-based login or invent uniqueness. The requested username field is provided as an editable display name, with email login remaining the verified sign-in method.

## Status

Automated CI guards the code, not SMTP deliverability, production Auth configuration, or remote SQL execution. Do not declare end-to-end authentication healthy until staging migrations, SMTP and real user flows pass. No live database mutations or test account registrations were made in this review.
