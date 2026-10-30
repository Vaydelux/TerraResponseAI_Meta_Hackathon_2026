/**
 * Narrow, privacy-preserving error messages for hosted Supabase email signup.
 * The provider's raw message may contain sensitive account metadata; never
 * forward it to the browser. Keep rate limits and account existence opaque.
 */
export type SignupFailure = { message: string; field?: "email" | "password" };

export function signupFailure(code?: string, status?: number): SignupFailure {
  switch (code) {
    case "email_address_invalid":
      return {
        message: "Supabase did not accept that email address. Check for a typo and use a valid, deliverable inbox (not a placeholder or test address).",
        field: "email",
      };
    case "email_address_not_authorized":
      return {
        message: "Email delivery is restricted for this project. Use an authorized address or contact the administrator to configure an email provider.",
        field: "email",
      };
    case "email_provider_disabled":
    case "signup_disabled":
      return { message: "Email registration is currently disabled by the project administrator." };
    case "weak_password":
      return { message: "Supabase rejected this password. Choose a stronger, unique password.", field: "password" };
    case "over_email_send_rate_limit":
      return { message: "This project's email confirmation quota has been reached. Your account is not yet confirmed. Repeated attempts will not help. Contact the administrator to configure custom SMTP or wait for the provider quota to reset." };
    case "over_request_rate_limit":
      return { message: "Too many authentication attempts. Please stop retrying and try again after the provider's rate limit resets." };
    // Never confirm the presence of a specific email account.
    case "email_exists":
    case "user_already_exists":
      return { message: "If this email is already registered, sign in or use password recovery. Otherwise, try again later." };
    default:
      if (status === 429) {
        return { message: "Too many registration attempts. Try again later." };
      }
      return { message: "Registration could not be completed. Please try again later or contact the administrator." };
  }
}
