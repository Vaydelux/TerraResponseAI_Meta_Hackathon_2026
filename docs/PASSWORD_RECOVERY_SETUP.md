# Password recovery — TerraResponse AI

## App routes

- `/login`: **Forgot password?** link and reset-complete success message
- `/forgot-password`: generic response for existing/nonexistent emails, Supabase reset request
- `/auth/confirm?flow=recovery`: exchanges the PKCE code **or** server-verifies a recovery token hash, then sets a short-lived HttpOnly recovery flag
- `/reset-password`: requires verified recovery link + Supabase session; changes password using `supabase.auth.updateUser` and signs the user out
- Existing signup/OAuth `/auth/callback` is unchanged. No service-role key is used in password reset.

## Supabase dashboard setup (BOTH staging and production projects)

**This repository cannot remotely modify the hosted Supabase Auth email template through its connector. Set the template in each project dashboard.**

1. Go to **Supabase → Authentication → Email Templates → Reset password**.
2. Set the **subject**: `Reset your TerraResponse AI password`.
3. You can paste the user's exact template from `supabase/email-templates/reset-password.html`. It uses `{{ .ConfirmationURL }}` and works through Supabase's built-in verification redirect and the new PKCE callback, **when the reset link is opened in the browser that requested it**.
4. **Recommended for different devices, browser privacy restrictions or email-client context:** Paste `supabase/email-templates/reset-password-ssr-recommended.html` instead. It uses `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`. Supabase substitutes the time-limited hash and sends the user to the app's server-side `/auth/confirm`, which verifies `type: "recovery"`. This avoids relying on the original browser's PKCE verifier.
5. Save the email template. Never paste an API key into the template.

### URL Configuration (required)

In **Authentication → URL Configuration**, set Site URL to `https://terra-response-ai.vercel.app` for production. In BOTH projects, allow redirect URLs for:

- `https://terra-response-ai.vercel.app/auth/confirm` and `https://terra-response-ai.vercel.app/auth/confirm?flow=recovery` as appropriate to your Supabase matching rules
- Staging: the exact Vercel Preview deployment's `https://<preview-host>/auth/confirm?flow=recovery` URL (recommended), or a restricted wildcard for your own preview deployment subdomain
- `http://localhost:3000/auth/confirm?flow=recovery` for local testing

Supabase redirect allowlisting must match the redirect target including query as required by the project's matching rules. Consider a `/**` wildcard under each explicitly trusted application origin if necessary; **never permit arbitrary third-party redirect domains**.

For production, configure `NEXT_PUBLIC_SITE_URL=https://terra-response-ai.vercel.app` (the app also has a matching canonical fallback). Vercel supplies `VERCEL_URL` and `VERCEL_ENV` for previews. Preview reset links must use Preview's staging Supabase project; Production must use Production Supabase. Never cross the credentials.

### SMTP and deliverability

Supabase's trial mailer is rate-limited and is not guaranteed for public distribution. Configure a verified custom SMTP provider if you need real recovery emails for hackathon judges. Verify spam folders, sender identity and throttling. Recovery requests intentionally return the same successful message whether an email is registered or not.

### Five-minute test

1. Open the deployed `/login` and select **Forgot password?**
2. Enter your own disposable staging account email. Confirm the generic sent message.
3. Open the email link; you should land at `/reset-password` with a verified-link banner, not be redirected back to Login.
4. Enter a different 12–72 character password and confirm it. Check that the success redirects to `/login?password_reset=success`.
5. Sign in with the new password. Confirm the old password no longer works.
6. Test an expired/used link and direct access to `/reset-password`: they should not allow the password to change.
7. Repeat in Production with an authorized non-privileged test account, **without exposing real passwords in logs or screenshots**.

Notes: Supabase's `{{ .ConfirmationURL }}` can be consumed by email link scanners. The token-hash variant is generally more portable but a scanner that follows that link may also consume the one-time token. If your provider aggressively prefetches, use a click-to-confirm POST flow or email OTP before general public launch.

**No database migrations are required.** The change uses Supabase Auth's existing recovery token and session mechanisms.
