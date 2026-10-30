/** Validate post-login paths without reading server-side secrets in client code. */
export function safeAuthPath(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") ||
      Array.from(next).some((char) => {
        const code = char.charCodeAt(0);
        return code < 32 || code === 127;
      })) return "/dashboard";
  try {
    const origin = "https://terraresponse.invalid";
    const url = new URL(next, origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
      return "/dashboard";
    }
    return url.pathname + url.search + url.hash;
  } catch { return "/dashboard"; }
}

export function safeAuthRedirect(next: string, requestUrl: URL): URL {
  return new URL(safeAuthPath(next), requestUrl.origin);
}
