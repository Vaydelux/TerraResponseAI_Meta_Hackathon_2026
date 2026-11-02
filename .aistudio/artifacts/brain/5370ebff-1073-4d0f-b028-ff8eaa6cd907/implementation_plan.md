# Implementation Plan: Elevated Gradient & Glassmorphic UI System

## 1. Visual Direction & Design Tokens
We will introduce a **Deep Ocean Teal → Emerald & Warm Amber** gradient palette paired with **refined glassmorphic surfaces**, crisp hairline borders, and multi-layered soft elevation across both **Day Mode** and **Night Ops (Dark Mode)**.

### New Design Tokens (`src/app/styles/tokens.css`)
- **Primary Ocean-to-Emerald Gradient (`--grad-primary`)**:
  - Day Mode: `linear-gradient(135deg, #0D5868 0%, #0F6E7A 52%, #1E7E57 100%)`
  - Night Ops: `linear-gradient(135deg, #0E4D5C 0%, #1F8396 52%, #2EB872 100%)`
- **Interactive Hover Gradient (`--grad-primary-hover`)**:
  - Day Mode: `linear-gradient(135deg, #094552 0%, #0D5E69 50%, #186B49 100%)`
  - Night Ops: `linear-gradient(135deg, #156275 0%, #2AA1B7 50%, #38CC82 100%)`
- **Amber Provisional / Alert Gradient (`--grad-amber`)**:
  - `linear-gradient(135deg, #B86F14 0%, #D98A2B 55%, #E6A23C 100%)`
- **Critical Crimson-to-Amber Gradient (`--grad-critical`)**:
  - `linear-gradient(135deg, #B4382A 0%, #D14D3B 55%, #D98A2B 100%)`
- **Ambient Surface & Hero Banner Wash (`--grad-hero-surface` & `--grad-card-sheen`)**:
  - Subtle diagonal sheen (`linear-gradient(160deg, color-mix(in srgb, var(--sheet) 92%, #ffffff) 0%, var(--sheet) 65%, color-mix(in srgb, var(--tide-wash) 42%, var(--sheet)) 100%)`) for cards, hero banners, and split-panel auth portals.
- **Refined Glassmorphic Surfaces (`--glass-bg`, `--glass-border`, `--lift-elegant`)**:
  - Translucent frosted backdrop (`backdrop-filter: blur(14px) saturate(140%)`), subtle top-edge specular highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.35)` in Day / `rgba(255, 255, 255, 0.08)` in Night), and soft multi-layer drop shadows.

---

## 2. Targeted Component Upgrades

### A. Glassmorphic Cards, Headers & Floating Docks (`src/app/styles/components.css`, `src/app/styles/layout.css`, `src/app/styles/map.css`)
- **Top Navigation Bar (`.topbar`) & Mobile Drawer**: Frosted glass header with a subtle bottom gradient accent rule and refined active navigation pill indicator.
- **Panels & KPI Cards (`.panel`, `.kpi-card`, `.triage-card`)**: Smooth diagonal surface sheen, crisp border transitions on hover, and subtle inner specular highlights.
- **Floating Docks & Overlays (`.shortcuts-bar`, `.shortcuts-dialog`, `.map-filter-bar`, `.tactical-scrubber`, `.tactical-gps-pill`, `.map-panel`)**: Elevated frosted glass containers with crisp borders and smooth shadows so floating controls feel light and tactile over the map and dashboard.
- **Auth Split Portals (`.auth-portal__aside`)**: Deep Ocean Teal-to-Emerald atmospheric wash on the left briefing column with refined badge pills.

### B. Gradient Hero Banners, Buttons & Active Filter Pills
- **Primary Buttons (`.btn--primary`)**: Ocean-to-Emerald gradient fill with a subtle top inner highlight, smooth hover lift, and soft teal glow shadow.
- **Dashboard Welcome Banner & 4-Step Workflow Strip (`src/app/(app)/dashboard/page.tsx`, `src/app/styles/components.css`)**:
  - Upgrade the dashboard welcome header into an elegant gradient-bordered banner card with a subtle Ocean-to-Emerald ambient wash.
  - Style the 4-step workflow strip badges with gradient numbered medallions and connecting progress accents.
- **Active Filter Pills & Segmented Controls (`.tactical-layer-btn[aria-pressed="true"]`, `.map-sev-pill[aria-pressed="true"]`, `.track-card[aria-pressed="true"]`)**:
  - Apply the Ocean-to-Emerald gradient to active hazard category buttons, active timeline jump pills, and selected registration tracks, with glowing indicator dots on severity pills.

### C. Gradient D3 Chart Bars, KPI Progress Fills & Severity Stripes
- **D3 Hazard Summary Bar Chart (`src/components/map/HazardSummaryChart.tsx`)**:
  - Define SVG `<defs>` with `<linearGradient>` definitions (`#d3-grad-confirmed` in Ocean Teal → Emerald and `#d3-grad-pending` in Warm Amber → Gold) so the horizontal stacked D3 bars render with smooth, high-craft gradient fills.
- **KPI Progress Bars & Temporal Histogram (`.kpi-bar__fill`, `.tactical-scrubber__bar[data-active="true"]`)**:
  - Apply smooth horizontal Ocean-to-Emerald gradients to verification progress bars and vertical Teal-to-Emerald gradients to active timeline histogram bars.
- **Severity-Banded Triage Cards (`.triage-card__stripe`)**:
  - Upgrade the top 5px severity bands on `IncidentTriageCard` to rich multi-stop gradients corresponding to each severity level (Critical Crimson-to-Amber for Sev 5, Warm Amber-to-Gold for Sev 4, Ocean Teal-to-Cyan for Sev 3, Slate-to-Teal for Sev 1–2).

---

## 3. Verification
- Compile the Next.js application (`compile_applet`) to verify zero TypeScript or CSS build issues.
- Run the Vitest verification suites (`hardening-integrity`, `auth-workflow-hardening`, `live-login-readiness`, `signup-brand-integrity`, `no-login-redirect-loop`, and `landing-integrity`) to confirm all security and structural invariants remain intact.
