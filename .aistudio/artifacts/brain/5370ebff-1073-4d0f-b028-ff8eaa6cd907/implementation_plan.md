# Clean & Consistent Minimalist-Precision UI Redesign

This plan establishes a unified, minimalist-precision visual system across TerraResponse AI—replacing competing inline styles, heavy decorative gradients, and visual clutter with crisp 1px borders, clean flat-to-subtle surfaces, balanced spacing rhythm, and strict typographic hierarchy across Day Mode and Night Ops.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions incorporate your confirmed preferences from the clarification step and govern the visual cleanup across all screens:

- **Confirmed Decision 1 — Visual Direction**: **Minimalist precision with crisp borders and clean surfaces**. We will replace heavy multi-stop gradients, thick colored accent borders, and competing drop shadows with crisp `1px solid` structural borders (`--rule`), clean flat surfaces (`--sheet`, `--paper`), subtle active states, and high-contrast typography.
- **Confirmed Decision 2 — Priority Areas**:
  1. **Unified Navigation Header, Page Headers & Footer Layout**: Streamline the sticky top bar, standardize page header spacing/alignment and action clusters, and unify footer typography and spacing.
  2. **Standardized Dashboard, Review Workbench & Upload Cards**: Replace ad-hoc inline styles (such as mismatched CSS variable names in the Contextual Intelligence card and Voice Dictation control) with shared semantic `.panel` and `.field` design-system primitives.
  3. **Decluttered Map Controls, Filter Bar & Sidebar Panels**: Consolidate the Map Filter Bar, Temporal Scrubber, D3 Hazard Summary Chart, and Right Rail into a clean, cohesive workspace with reduced chrome and crisp segmented controls.
- **Confirmed Decision 3 — Information Density & Spacing Rhythm**: **Balanced spacing with clear hierarchy and reduced visual noise**, enforcing a strict 4px/8px spatial scale (`--s-1` through `--s-7`), single-elevation card depth (no nested bordered boxes inside cards), and tabular numerals (`tabular-nums`) for all metrics and timestamps.

---

### 1. Overview & Core Concept

- **What It Does**: Harmonizes every user-facing surface in TerraResponse AI under one cohesive design language so contributors, reviewers, and incident commanders experience seamless visual continuity when moving between the Commander Dashboard, Tactical Incident Map, Review Workbench, and Report Upload flows.
- **Target Audience / Persona**: Emergency response coordinators, human verification reviewers working extended shifts in Day or Night Ops mode, and field contributors submitting hazard documentation under time pressure.
- **Key Value**: Eliminates visual fatigue and "split-brain" styling inconsistencies (such as mixed inline token names and competing border/shadow treatments), making critical epistemic signals—especially the **Verification Seal** (amber hatched unverified AI output vs. solid human-verified state)—stand out with unmistakable clarity.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  - **Global Navigation & Shell**: Users see a clean 56px sticky top bar with the survey-corner wordmark, concise single-line navigation links with a subtle active bottom indicator, and a unified right-side utility cluster (Event Switcher, Day/Night Ops toggle, User Menu). Below the fold, every workspace opens with a standardized `PageHeader` featuring a balanced display heading, unboxed metadata subtitle with `·` separators, and right-aligned primary actions.
  - **Commander Dashboard & Keyboard Shortcuts**: The KPI strip, triage card grid, and live operations feed use uniform `1px solid var(--rule)` card surfaces with consistent `24px` outer padding, clean hairline dividers instead of nested sub-cards, and a compact, unobtrusive Keyboard Shortcuts dock.
  - **Review Workbench & Contextual Intelligence**: The two-column workbench pairs the sticky `EvidenceViewer` on the left with the `ObservationPanel` and `ContextualIntelligenceCard` on the right. Both right-column panels share identical border radii (`--r-panel`), border tokens (`--rule`), section header typography, and clean unboxed source citations—removing thick left/top accent bars and ad-hoc inline styles.
  - **Report Upload & Voice Dictation**: The 3-step upload flow presents a clean horizontal step indicator, a crisp dropzone, and a unified `Description` field where the microphone `VoiceDictationControl` sits cleanly in the field header row with a subtle recording banner using native theme tokens.
  - **Tactical Incident Map**: The top `MapFilterBar` is streamlined into a compact, single-elevation toolbar with clean segmented toggles for Hazard Categories, Severity Levels, and the Heatmap layer. The map viewport, bottom `TemporalScrubber`, and right-rail incident summary (`HazardSummaryChart` + `Download Map Snapshot` button) align on a uniform grid with crisp borders and zero visual overlap.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Minimalist civic-cartographic precision—calm survey-paper neutrals in Day Mode and deep slate-ink surfaces in Night Ops, where color is reserved strictly for semantic verification state and hazard severity.
  - *Color Palette & Mood*:
    - **60% Dominant Neutral Canvas**: Crisp cool-alabaster survey paper (`--paper: #F5F7F7` in Day Mode; `#0B1217` in Night Ops).
    - **30% Structural Surfaces & Hairlines**: Pure elevated sheet panels (`--sheet: #FFFFFF` in Day Mode; `#111C24` in Night Ops), subtle recessed wells (`--sheet-sunk: #EEF2F2` / `#172530`), and `1px solid` structural borders (`--rule: #D8E0DF` / `#223442`).
    - **10% Semantic & Action Accent Budget**: Deep ocean teal (`--tide: #0B6574` / `#48B5C6`) for primary interactive affordances; amber (`--amber`) strictly for unverified AI observations; forest green (`--green`) for human-confirmed reports; brick crimson (`--brick`) for rejected/critical alerts.
  - *Typography & Hierarchy*:
    - **Display & Headings**: `Bricolage Grotesque` (`--font-display`) with `text-wrap: balance`, tight tracking (`-0.02em`), and controlled sizing (`--step-2` to `--step-3`).
    - **Body & UI Controls**: `Public Sans` (`--font-ui`) at `15px–16px` (`--step-0`) with `1.55` line height and single-line (`whitespace-nowrap`) control labels.
    - **Metrics, Coordinates & Timestamps**: Tabular numerals (`font-variant-numeric: tabular-nums`) across all KPI counters, priority scores, coordinates, and timers.

- **Interactive Feedback & Motion**:
  - Fast `120ms–180ms` transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) restricted to `opacity`, `transform`, and border/background color tokens.
  - Subtle hover states (`--sheet-sunk`) on secondary buttons, table rows, and filter chips; preserved hover scale and glow on map pins and D3 cluster markers.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Unifying Token Vocabulary Across All Components**
  - *Chosen Approach*: Standardize all newly added and existing components (`ContextualIntelligenceCard`, `VoiceDictationControl`, `MapFilterBar`, `TemporalScrubber`, `HazardSummaryChart`, `KeyboardShortcutsDock`) onto the canonical token system defined in `tokens.css` (`--paper`, `--sheet`, `--sheet-sunk`, `--rule`, `--ink`, `--ink-2`, `--ink-3`, `--tide`, `--s-1`..`--s-6`, `--r-ctl`, `--r-panel`).
  - *Why*: Recent components introduced mismatched CSS variable names (e.g., `--space-3`, `--fg-primary`, `--bg-subtle`, `--border-subtle`) that fell back to browser defaults, causing inconsistent padding, missing borders, and broken Day/Night theme contrast.
  - *Alternatives Considered*: Adding alias variables in `tokens.css` was considered, but replacing inline style drift with semantic classes in `components.css` and `map.css` produces cleaner DOM markup and guarantees strict visual consistency.

- **Decision 2: Single-Elevation Surface Architecture (Replacing Heavy Gradients & Nested Cards)**
  - *Chosen Approach*: Tone down multi-stop background gradients and heavy drop shadows in `tokens.css` and `components.css` in favor of clean flat/subtle surfaces with `1px solid var(--rule)` borders and hairline internal dividers.
  - *Why*: Eliminates "cards within cards" and decorative visual noise, allowing the Verification Seal's amber hatch pattern, D3 data visualizations, and photographic evidence to command primary visual attention.
  - *Alternatives Considered*: Keeping heavy glassmorphic blurs everywhere was rejected because it reduces text legibility on dense data screens and conflicts with minimalist precision.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Unified Design Token Layer (tokens.css)                  │
│   Day Mode & Night Ops Surfaces (--paper, --sheet, --rule, --ink, --tide)    │
└──────────────────┬────────────────────────────────────────┬──────────────────┘
                   │                                        │
                   ▼                                        ▼
┌─────────────────────────────────────────┐  ┌─────────────────────────────────┐
│     Global Shell & Navigation Layer     │  │   Standardized Workspace Views  │
│  ┌───────────────────────────────────┐  │  │  ┌───────────────────────────┐  │
│  │ TopBar (Wordmark, Nav, Utilities) │  │  │  │ Commander Dashboard       │  │
│  ├───────────────────────────────────┤  │  │  │ • KPI Strip & Triage Grid │  │
│  │ PageHeader (Title, Meta, Actions) │  │  │  │ • KeyboardShortcutsDock   │  │
│  ├───────────────────────────────────┤  │  │  ├───────────────────────────┤  │
│  │ Global Footer (Clean Metadata)    │  │  │  │ Review Workbench          │  │
│  └───────────────────────────────────┘  │  │  │ • EvidenceViewer (Sticky) │  │
└─────────────────────────────────────────┘  │  │ • ObservationPanel        │  │
                                             │  │ • ContextualIntelligence  │  │
                                             │  ├───────────────────────────┤  │
                                             │  │ Report Upload Flow        │  │
                                             │  │ • 3-Step Progress Bar     │  │
                                             │  │ • VoiceDictationControl   │  │
                                             │  ├───────────────────────────┤  │
                                             │  │ Tactical Incident Map     │  │
                                             │  │ • Compact MapFilterBar    │  │
                                             │  │ • D3 Clusters & Heatmap   │  │
                                             │  │ • TemporalScrubber        │  │
                                             │  │ • Right Rail & D3 Chart   │  │
                                             │  └───────────────────────────┘  │
                                             └─────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **TopBar & ThemeToggle**: Maintains active route highlighting (`aria-current="page"`), mobile drawer state (`mobileOpen`), active event cookie switching, and synchronized Day/Night Ops theme toggling (`data-theme="day" | "night"` and `.dark` class).
  - **ReviewWorkbench & ContextualIntelligenceCard**: Preserves parallel data fetching (`/api/reports/[id]`, `/priority`, `/segment`, `/review`, `/context`), interactive SAM mask toggling, review resolution actions, and on-demand Google Search grounding refresh (`POST /api/reports/[id]/context`) with semantic `.obs-context` styling.
  - **UploadFlow & VoiceDictationControl**: Preserves 3-step validation, EXIF GPS extraction, and live microphone recording (`MediaRecorder` + `/api/transcribe` and Web Speech API preview) styled with clean `.voice-dictation` classes.
  - **Tactical Map Controls (`MapFilterBar`, `TemporalScrubber`, `HazardSummaryChart`, `IncidentMap`)**: Preserves real-time category/severity filtering, heatmap density overlay toggle (`data-testid="heatmap-layer-toggle"`), D3 pin clustering (`d3Cluster.ts`), temporal play/pause scrubbing, and 2x PNG snapshot export (`data-testid="download-map-snapshot"`), while consolidating control spacing and border alignment.
