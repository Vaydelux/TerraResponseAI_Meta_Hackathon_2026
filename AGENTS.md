# Mandatory AI-agent release gate

**READ THIS FIRST before changing auth, running Supabase migrations, creating test users, or deploying TerraResponse AI.**

## Open security release blocker

**[Issue #21 — Restore email verification and remove temporary test accounts](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21)**.

At the beginning of every new coding-assistant session about authentication, testing or release, **ask the owner**:

> Have we restored and tested email confirmation, configured production-ready SMTP, deleted all preconfirmed demo users, and verified staging/production role security?

Never quietly dismiss or close #21. Temporary test accounts must never count as proof that a user controls the email address. This repository's `main` branch is connected to a **public Vercel production deployment**. Treat production changes as sensitive.

### Testing policy

- Preserve email syntax validation and strict password validation in application code.
- Never disable confirmation globally in a live project merely to avoid SMTP quotas.
- If three role-based users are needed, use the separate staging project and a **manual protected workflow** using the Supabase Auth Admin API (no direct SQL inserts into auth.users). Preconfirm only these three staging demo accounts.
- Keep staging secrets and passwords in protected GitHub environment secrets. Never write secrets or generated credentials into Git, issues, test logs, stdout, PR comments, or user-visible answers.
- Never elevate role through user-editable auth metadata. Assign global roles as privileged, explicit server-side changes in `public.profiles`, with RLS tests afterward.
- Before a production release, delete staging demo identities and synthetic evidence, restore/verify email confirmation and SMTP, test signed callback and authorization with actual accounts, and close #21 **only after owner approval**.
- Do not claim ISO/IEC 27001, ISO 9241, WCAG compliance or completed external audits based solely on CI.

## Known issues and gate dependencies

As of 2026-10-31, Supabase showed **0001 and 0002 migrations applied**, with others pending. Live registration failed with `over_email_send_rate_limit` due to built-in hosted SMTP. Security advisors also found exposed SECURITY DEFINER functions. Apply reviewed migrations to isolated staging, run security advisors and verify RLS and private storage with each role before testing/public deployment.

Read `docs/AUTH_WORKFLOW_HARDENING.md` and issue #21 for background.
