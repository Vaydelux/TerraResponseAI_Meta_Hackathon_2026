# TerraResponse AI — Public registration and favicon

Public registration is available at `/signup`. It uses `supabase.auth.signUp` in a server action via the request-scoped Supabase SSR client. Signup never accepts role, event-member or admin fields; the database trigger creates an ordinary `reporter` profile. An administrator grants reviewer/admin access later, according to the project's authorization standard.

## Hosted Supabase Auth configuration required

- In the **same Supabase project used by the Vercel runtime**, enable **Auth → Providers → Email** and **Auth → Settings → Allow new users to sign up**.
- **Confirm email** should be enabled for a public deployment. Add `https://terra-response-ai.vercel.app/auth/callback` to **Auth → URL Configuration → Redirect URLs**, and set the Site URL to `https://terra-response-ai.vercel.app`. Registration emails may otherwise redirect to localhost or an unapproved origin.
- Set `NEXT_PUBLIC_SITE_URL=https://terra-response-ai.vercel.app` in the Vercel environment, then redeploy. Server-side fallback uses `VERCEL_PROJECT_PRODUCTION_URL` when available. If neither is configured, Supabase uses its own Site URL.
- Verify the hosted Supabase profile-creation trigger `trg_handle_new_user` and that migrations `0003`–`0010` required by the application have actually **been applied**. A dry-run is not an application. Misconfigured triggers can make account creation fail, even if the UI works.
- Confirmation email delivery depends on Supabase Auth email rate limits and SMTP setup. For a public or hackathon demo, configure working custom SMTP rather than relying on limited default email delivery. Do not disable email verification just to bypass SMTP.
- Vercel runtime must have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus `SUPABASE_SERVICE_ROLE_KEY` **server only**. No GitHub Action secret is automatically copied to Vercel.
- Use a synthetic test account, verify email confirmation → /auth/callback → login, profile role `reporter`, no event membership by default, and no ability to self-assign admin or reviewer.

## Icon change
The old root metadata linked to an unrelated external logo. The brand now ships locally as `src/app/icon.svg`, `src/app/favicon.ico` (real ICO bytes) and `public/logo.svg`. Both favicon formats use the same dark-teal survey corner, ivory guide brackets, and amber provisional-data quadrant as the TerraResponse wordmark.

If the old icon remains after deploying, check `https://terra-response-ai.vercel.app/favicon.ico` directly and perform a hard refresh; browsers aggressively cache favicons.
