import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/registration-policy";

export const RECOVERY_COOKIE_NAME = "tr-password-recovery";

/** Only trusted deployment configuration determines email redirect hosts. */
export function recoveryCallbackUrl(config: {
  vercelEnv?: string;
  vercelUrl?: string;
  siteUrl?: string;
  local?: boolean;
}): string {
  if (config.local) return "http://localhost:3000/auth/confirm?flow=recovery";

  const site = config.siteUrl || "https://terra-response-ai.vercel.app";
  const base = config.vercelEnv === "preview" && config.vercelUrl
    ? `https://${config.vercelUrl}`
    : site;
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid password recovery site URL.");
  }
  return new URL("/auth/confirm?flow=recovery", url).toString();
}

export function validRecoveryEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.includes("..") || /[\u0000-\u001f\u007f]/.test(email)) return null;
  return email;
}

const WEAK_PASSWORDS = new Set([
  "password123456", "password123!", "qwerty123456", "123456789012",
  "letmein123456", "welcome123456", "admin12345678", "passwordpassword",
]);

export function validateNewPassword(
  password: string,
  confirmation: string,
  email?: string | null,
): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `Use a password between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`;
  }
  const normalized = password.toLowerCase();
  const localPart = email?.split("@")[0]?.trim().toLowerCase() || "";
  if (WEAK_PASSWORDS.has(normalized) ||
      (localPart.length >= 3 && normalized.includes(localPart))) {
    return "Choose a less predictable password that does not contain your email name.";
  }
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
