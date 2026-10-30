/**
 * Only accept same-origin path redirects following Supabase OAuth/email
 * callbacks. Never trust a user-supplied URL for a post-login redirect.
 */
export function safeAuthRedirect(next: string, requestUrl: URL): URL {
  const fallback = new URL("/dashboard", requestUrl.origin);
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") ||
      Array.from(next).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })) return fallback;
  try {
    const target = new URL(next, requestUrl.origin);
    if (target.origin !== requestUrl.origin ||
        (target.protocol !== "http:" && target.protocol !== "https:")) return fallback;
    return target;
  } catch {
    return fallback;
  }
}
