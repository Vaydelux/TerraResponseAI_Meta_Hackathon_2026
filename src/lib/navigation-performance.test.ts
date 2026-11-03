import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source = (path: string) => readFileSync(path, "utf8");

describe("fast authenticated navigation", () => {
  it("prefetches a static route-group fallback for dynamic pages", () => {
    const loading = source("src/app/(app)/loading.tsx");
    expect(loading).toContain("RouteLoading");
    expect(source("src/components/layout/RouteLoading.tsx")).toContain('aria-busy="true"');
    for (const path of ["reports/[id]", "review/[id]", "incidents/[id]"]) {
      expect(source(`src/app/(app)/${path}/loading.tsx`)).toContain("RouteLoading");
    }
  });

  it("keeps native Next.js links and provides a real pending state", () => {
    const nav = source("src/components/layout/TopBar.tsx");
    expect(nav).toContain('import Link from "next/link"');
    expect(nav).toContain("<NavPendingIndicator />");
    expect(nav).not.toContain('prefetch={false}');
    expect(source("src/components/layout/NavPendingIndicator.tsx")).toContain("useLinkStatus");
  });

  it("uses client routing for internal action buttons but preserves native external links", () => {
    const button = source("src/components/ui-tr/Button.tsx");
    expect(button).toContain('import Link from "next/link"');
    expect(button).toContain('href.startsWith("/")');
    expect(button).toContain("!anchorRest.download");
    expect(button).toContain("<Link className={cls} href={href}");
    expect(button).toContain("<a className={cls} href={href}");
  });

  it("does not upsert the intake membership on every tab navigation", () => {
    const layout = source("src/app/(app)/layout.tsx");
    expect(layout).toContain("!ctx.events.some");
    expect(layout).toContain("COMMUNITY_INTAKE_SLUG");
    expect(layout).toContain("ensureCommunityIntakeMembership(user.id)");
    expect(layout).toContain('ctx.user.role === "reviewer"');
    expect(source("src/app/(app)/reports/new/page.tsx")).toContain("e.event_status === \"active\"");
  });

  it("deduplicates server identity and fetches profile/roles in parallel per request", () => {
    expect(source("src/lib/supabase/server.ts")).toContain("getServerUser = cache(");
    const context = source("src/lib/auth/profile.ts");
    expect(context).toContain("const cachedContextByUserId = cache(");
    expect(context).toContain("await Promise.all([");
    expect(context).toContain("cachedContextByUserId(resolvedUser.id)");
  });

  it("does not serialize independent dashboard reads", () => {
    const dashboard = source("src/app/(app)/dashboard/page.tsx");
    expect(dashboard).toContain("countsPromise");
    expect(dashboard).toContain("recentPromise");
    expect(dashboard).toContain("auditPromise");
    expect(dashboard).toContain("await Promise.all([countsPromise, recentPromise, auditPromise])");
  });

  it("does not eagerly bundle MapLibre into the server map page", () => {
    const page = source("src/app/(app)/map/page.tsx");
    const wrapper = source("src/components/map/DeferredIncidentMap.tsx");
    expect(page).toContain("<DeferredIncidentMap");
    expect(wrapper).toContain('ssr: false');
    expect(wrapper).toContain('import("./IncidentMap")');
  });
});
