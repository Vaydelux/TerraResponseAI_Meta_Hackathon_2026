# Full-App Screen Utilization & Command Hub Visual Consistency Plan

## 1. Overview & Goals
Following our codebase audit across all pages and components, this plan unifies every screen in **TerraResponse AI** around the **Tactical Command Hub** aesthetic established on `/dashboard` and `/map`, wires all 5 built-but-unmounted UI components into their respective workflows, and transforms sparse views (including Upload Photo Step 3, Incident Thread Detail, Audit Log, Admin Roles, and Profile) into rich, high-density operational screens.

---

## 2. Wire All 5 Unused Components Into Their Pages

1. **`FilterRail` (`/src/components/layout/FilterRail.tsx`)**
   - Mount `FilterRail` on `/reports` (`showMine={true}`) and `/review` (`showMine={false}`).
   - Update `ReportList` (`/src/components/report/ReportList.tsx`) and `ReviewQueueTable` (`/src/components/review/ReviewQueueTable.tsx`) to read URL `useSearchParams()` (`status`, `severity`, `mine`) alongside a live search input so toggling any pill filters the displayed rows/cards immediately.
2. **`ReportCard` (`/src/components/report/ReportCard.tsx`)**
   - Add a **List View (`ReportRow`) / Grid View (`ReportCard`)** segmented toggle inside `ReportList` on `/reports` so operators can inspect reports either as compact tactical rows or visual 16:10 thumbnail cards.
3. **`PriorityOverride` (`/src/components/admin/PriorityOverride.tsx`)**
   - Mount `PriorityOverride` in the right-hand column of `ReviewWorkbench` (`/src/components/review/ReviewWorkbench.tsx`) when `!readOnly`, allowing reviewers and admins to override the computed priority score (`0–100`) with a required audit log reason and live score state update.
4. **`AuditLogFilters` (`/src/components/admin/AuditLogFilters.tsx`)**
   - Connect `AuditLogFilters` inside `AuditLogTable` (`/src/components/admin/AuditLogTable.tsx`) and `/audit` so reviewers/admins can filter audit entries in real time by `action`, `actor`, and free-text `query`.
5. **`EventSwitcher` (`/src/components/layout/EventSwitcher.tsx`)**
   - Integrate `EventSwitcher` into the workspace header / `TopBar` context so operators can switch active disaster incident events (`tr-active-event`) from any operational screen.

---

## 3. Upload Photo Step 3 ("Ready to Submit") Overhaul (`/src/components/upload/UploadFlow.tsx`)
Replace the sparse 3-line text box on Step 3 with a comprehensive **Pre-Submission Command Review Card**:
- **Photo Evidence Preview**: 16:10 thumbnail preview of the selected/pasted photo with filename, file size, and source badge (`EXIF GPS Verified` vs. `Manual Pin Placement`).
- **Structured Metadata Grid**: Report title, incident description preview, exact formatted latitude/longitude coordinates (`formatCoords`), capture timestamp, and quick **"Edit Photo (Step 1)"** / **"Edit Details & Location (Step 2)"** jump buttons.
- **AI Telemetry & Verification Pipeline Card**: Live summary of the pre-scanned Meta AI / Gemini 2.5 Flash Vision hazard assessment (detected hazard class, severity estimate, confidence score) and pipeline readiness indicators (`Gemini 2.5 Flash Structured Observation`, `SAM 3 Flood/Damage Masking`, `Priority Index Calculation`).

---

## 4. Command Hub Visual Polish Across All Secondary Pages

- **Reports Hub (`/src/app/reports/page.tsx` & `/src/components/report/ReportList.tsx`)**
  - Add a 4-card KPI summary strip (`Total Reports`, `Pending Triage`, `Verified / Confirmed`, `Critical Severity 4–5`).
  - Add a search bar + `FilterRail` + List/Grid (`ReportRow` / `ReportCard`) view switcher.
- **Review Queue (`/src/app/review/page.tsx` & `/src/components/review/ReviewQueueTable.tsx`)**
  - Add a Reviewer Triage KPI strip (`Queue Depth`, `High Priority >= 75`, `Critical Severity`, `Keyboard Nav J/K + Enter`).
  - Mount `FilterRail` + search input above the queue table.
- **Incident Threads (`/src/app/incidents/page.tsx` & `/src/app/incidents/[id]/page.tsx`)**
  - Upgrade `/incidents` with cluster KPI counters, radius/window telemetry pills, and `SealBadge` status indicators.
  - Redesign `/incidents/[id]` from plain paragraphs into a Command Hub cluster dossier with a 4-metric KPI strip (`Cluster Radius`, `Time Window`, `Linked Reports`, `Verification Status`) and rich linked report cards featuring `ReportThumb`, `SealBadge`, `SeverityMeter`, coordinates, and direct links to `/reports/[id]` and `/review/[id]`.
- **Notifications (`/src/app/notifications/page.tsx`)**
  - Add a notification summary strip (`Total Alerts`, `Unread`, `Cluster Triggers`) and structured alert cards with semantic icon badges and quick action buttons (`Open Thread`, `Inspect Report`).
- **Audit Log (`/src/app/audit/page.tsx` & `/src/components/admin/AuditLogTable.tsx`)**
  - Add an Audit Telemetry summary strip (`Total Events`, `Human Decisions`, `Priority Overrides`, `Role Changes`), mount `AuditLogFilters`, and render semantic badges for action types.
- **Admin User Roles (`/src/app/admin/users/page.tsx` & `/src/app/admin/users/role-manager-client.tsx`)**
  - Add a Role Distribution KPI strip (`Total Accounts`, `Admins`, `Reviewers`, `Contributors`), search & role filter bar, semantic role badges, and styled `ui-tr` `Select` controls.
- **Operator Profile (`/src/app/profile/page.tsx`)**
  - Upgrade the profile header into an Operator Dossier card with role badge, clearance indicator, and submission stats, and enrich the Recent Submissions list with report titles, `SealBadge`, and timestamps.
- **Account Unavailable (`/src/app/account-unavailable/page.tsx`)**
  - Wrap in `.tr-shell` with `Wordmark`, `ThemeToggle`, and a styled `.panel` status card with clear navigation actions.

---

## 5. Verification
- Run `compile_applet` and `lint_applet` to verify zero TypeScript, build, or lint errors across all updated routes and components.
