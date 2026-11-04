# Material 3 & shadcn Decongested Redesign Plan

## 1. Executive Summary & Core Objectives
Based on your feedback, this plan replaces the legacy 4-state theme system (`day`, `mist`, `night ops`, `auto`) with a standard, elegant **System / Light / Dark** mode, anchored by a clean dropdown menu. It applies **Material 3 design principles** (tonal surfaces, soft elevation, refined spacing) and integrates **shadcn Dialogs & Drawers** to decongest dense map and dashboard screens so users are never overwhelmed by floating boxes or crowded panels.

---

## 2. Theme Architecture Simplification (System, Light, Dark)

### A. Remove Legacy Themes
- Deprecate custom theme states: `day`, `mist`, `night_ops`, and `auto`.
- Standardize on `next-themes` standard values:
  - `system`: automatically syncs with OS preference (`prefers-color-scheme`).
  - `light`: clean, high-contrast Material 3 light theme (soft off-white/surface tones `#F8FAFC`, `#FFFFFF`, subtle cool slate borders).
  - `dark`: refined dark mode (deep slate `#090D10`, `#0F171E`, `#15222B`, without eye-straining pure black).

### B. Clean Dropdown Menu Navigation Component (`ThemeToggle.tsx`)
- Replace the legacy 4-button segmented pill control in the navigation topbar with a clean, compact dropdown button.
- Trigger button displays the active theme icon (`Sun` for light, `Moon` for dark, `Monitor` for system) with a subtle label or tooltip.
- Dropdown menu options using shadcn `DropdownMenu`:
  - **Light** (`Sun` icon)
  - **Dark** (`Moon` icon)
  - **System** (`Monitor` icon)
- Active selection highlighted with a gentle indicator or checkmark.

### C. Tokens & CSS Cleanup
- Update `src/app/styles/tokens.css` and `globals.css`:
  - Remove `--mist` and custom night-ops overrides.
  - Establish Material 3 tonal elevation variables:
    - `--md-sys-color-surface`: base page background
    - `--md-sys-color-surface-container-low`: cards, panels
    - `--md-sys-color-surface-container`: elevated cards, active items
    - `--md-sys-color-surface-container-high`: dialogs, modals, popovers
    - `--md-sys-elevation-1` to `--md-sys-elevation-3`: soft, diffuse shadows.

---

## 3. UI Decongestion via Modals & Dialogs (Material 3 + shadcn)

### A. Incident Details & Action Dispatch Modal (`IncidentDetailsDialog.tsx`)
- **Current Issue**: On `/map`, the large incident panel sits persistently over the canvas, competing with the scrubber, legend, and search filters, creating visual congestion.
- **New Pattern**:
  - Tapping an incident pin opens a clean, compact floating preview chip (`title`, `severity badge`, `one-click view details button`).
  - Clicking "View Details" opens a spacious, beautifully organized shadcn `Dialog`:
    - **Header**: Incident title, location coordinates with copy button, severity level badge, and verification status.
    - **Evidence & Vision Analysis**: Side-by-side or stacked photo evidence with SAM 3.1 segmentation mask toggle.
    - **Observations & Evidence Points**: Structured model findings and flagged uncertainties in clean Material 3 tonal list items.
    - **Footer / Agency Dispatch Actions**: Primary action buttons (`Review & Verify`, `Dispatch MMDA`, `Dispatch Coast Guard`, `Print Triage PDF`).

### B. Regional Weather & Seismic Radar Advisory Dialog (`RegionalHazardDialog.tsx`)
- **Current Issue**: The static 370px regional alert box occupies significant screen real estate on desktop and mobile.
- **New Pattern**:
  - Converted into a subtle, non-intrusive floating status chip in the map top-left (`Seismic Advisory Active` or `Weather Normal`).
  - Clicking the chip triggers the **Regional Hazard Radar Dialog**:
    - Comprehensive PHIVOLCS fault-line and liquefaction safety advisory.
    - Live Open-Meteo rainfall, wind speed, and riverway stage telemetry.
    - Grounding sources and evacuation guidance.

### C. Map Filter & Hazard Rail
- Keep the top filter bar clean and minimal: simple horizontal pill scroll for hazard types (`All`, `Floods`, `Road Closures`, `Medical`).
- Advance filters (date range, confidence slider, agency filter) accessible via a clean "Filters" popover or slide-over drawer rather than cluttering the primary canvas.

---

## 4. Material 3 Visual Polish & Component Refinement

- **Card Surfaces**: Rounded corners (`rounded-2xl`), subtle borders (`border-border/60`), and soft elevation shadows (`shadow-sm` transitioning to `shadow-md` on hover).
- **Typography & Hierarchy**: Fluid type scaling with strong contrast ratios, eliminating dense visual noise.
- **Buttons & Interactive Targets**: Minimum $44 \times 44\text{px}$ touch targets, ripple-like active states, clean Lucide iconography.
- **Zero-Clutter Guarantee**: Ample whitespace around critical indicators so emergency commanders can immediately parse priority signals without cognitive fatigue.

---

## 5. Implementation Roadmap & Verification

1. **Step 1**: Overhaul `ThemeToggle.tsx` and theme state management to standard System / Light / Dark dropdown. Clean up `providers.tsx` and CSS token definitions.
2. **Step 2**: Create the shadcn `IncidentDetailsDialog` and `RegionalHazardDialog` components.
3. **Step 3**: Refactor `/src/components/map/IncidentMap.tsx`, `IncidentPanel.tsx`, and `RegionalAlertOverlay.tsx` to wire the new modal workflows and eliminate persistent screen clutter.
4. **Step 4**: Update TopBar and page headers across the app for visual consistency with the new Material 3 design language.
5. **Step 5**: Run `compile_applet`, `lint_applet`, unit tests, and Playwright verification across mobile (390px) and desktop (1440px).
