// Toast notifications via Sonner. Re-exported here so the rest of the
// codebase has a single import surface (`@/lib/toast`) and we can
// swap the underlying toast library without touching call sites.
//
// Usage:
//   import { toast } from "@/lib/toast";
//   toast.success("Report uploaded");
//   toast.error("Something went wrong");
//   toast.warning("AI analysis pending — reviewer action required");
//   toast.info("Signed in");
//
// The <Toaster /> component is mounted in src/app/layout.tsx and is
// theme-aware via next-themes. No setup is needed in individual
// routes; just call `toast.*` from any client component or route
// handler that runs in the browser.
export { toast } from "sonner";
