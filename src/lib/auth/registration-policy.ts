/**
 * Shared contributor registration rules. All checks also run on the server.
 * Usernames are display names only; email remains the Supabase sign-in ID.
 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;
export const USERNAME_HINT = "3–24 characters; start with a letter; use lowercase letters, digits or underscores.";
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 72;
const COMMON = new Set([
  "password123456", "password123!", "qwerty123456", "123456789012",
  "letmein123456", "welcome123456", "admin12345678", "passwordpassword",
]);

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}
export function validateRegistration(input: {
  username: string; email: string; password: string; confirmation: string;
}): { field: "username" | "email" | "password" | "confirmPassword"; message: string } | null {
  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username) || ["admin", "support", "system", "root", "moderator"].includes(username)) {
    return { field: "username", message: "Choose a username: " + USERNAME_HINT };
  }
  const email = input.email.trim().toLowerCase();
  const parts = email.split("@");
  if (email.length > 254 || parts.length !== 2 ||
      parts[0].length < 1 || parts[0].length > 64 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.includes("..") || /[\u0000-\u001f\u007f]/.test(email)) {
    return { field: "email", message: "Enter a valid email address you can access to confirm your account." };
  }
  if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX) {
    return { field: "password", message: "Use a unique password between 12 and 72 characters." };
  }
  const lower = input.password.toLowerCase();
  if (COMMON.has(lower) ||
      lower.includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 3 ||
      lower.includes(username)) {
    return { field: "password", message: "Choose a less predictable password that does not contain your username or email name." };
  }
  if (input.password !== input.confirmation) {
    return { field: "confirmPassword", message: "The passwords do not match." };
  }
  return null;
}
export function passwordChecklist(password: string, username: string, email: string) {
  return {
    length: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    distinct: !username || !password.toLowerCase().includes(normalizeUsername(username)),
    notEmail: !email.split("@")[0] || !password.toLowerCase().includes(email.split("@")[0].toLowerCase()),
  };
}
