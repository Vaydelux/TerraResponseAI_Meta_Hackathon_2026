# TerraResponse AI — Visual design system

> This document governs visual presentation only. Authentication, database policies,
> triage decisions, model outputs, human review and public-warning safeguards are not
> interchangeable with branding. Do not infer verified disasters from UI color.

## Identity

**Name:** TerraResponse AI  
**Line:** See the evidence. Share the signal.  
**Personality:** Clear, civic, calm under pressure, human-centered and factual.

**Mark:** An ascending terrain ridge (place and hazard), a teal horizon (shared
observations) and coral signal arcs (communication). The mark is not a danger
classification and must not use the pending-review hatch. Design is intentionally
legible from 16 px to a vector-scaled 8K master.

| Source | Purpose |
|---|---|
| `public/logo.svg` | Canonical scalable visual mark for all UI surfaces |
| `src/app/icon.svg` | Next.js route favicon and mask-friendly SVG |
| `src/app/favicon.ico` | Multi-resolution 16, 24, 32, 48, 64, 128, 256 browser/Windows icon |
| `public/brand/readme-banner.svg` | README cover artwork |
| `src/components/layout/Wordmark.tsx` | Uses the same `/logo.svg` asset in app navigation |

Do not introduce independent, hand-drawn logo components, emoji placeholders,
external stock icons, or alternative brand hues as application logos.

## Typography

- **Bricolage Grotesque** — headings, large numerals, wordmark.
- **Public Sans** — descriptions, forms, controls, body text.
- **System monospace** — coordinates, timestamps and technical identifiers.
- Use `var(--font-display)` and `var(--font-ui)`. Keep body text >= 14 px,
  helper text high-contrast, labels in sentence case, and headings short.

## Color and meaning

`src/app/styles/tokens.css` is the source of truth. `src/app/globals.css`
bridges it into Tailwind/shadcn variables.

| Purpose | Day | Night Ops |
|---|---|---|
| Canvas `--paper` | `#F5F7F7` | `#0B1217` |
| Panel `--sheet` | `#FFFFFF` | `#111C24` |
| Primary text `--ink` | `#111F28` | `#ECF2F5` |
| Primary action `--grad-primary` | `#0B6574` | `#48B5C6` |
| Action label `--on-tide` | `#FFFFFF` | `#061D27` |
| Verified label `--on-green` | `#FFFFFF` | `#061D27` |
| Brand signal `--brand-signal` | `#E66A3D` | `#FF8552` |

**Mist** is a separate light variant. It uses the same verification-state
semantics as Day and remains light even on devices that prefer dark mode.

**Meaning is not decorative:**
- Amber hatch = AI-generated and not yet verified.
- Solid green = human-confirmed.
- Teal with correction indicator = human-corrected.
- Brick = rejection or urgency (always paired with text).
- Brand coral = broadcast concept in the logo, **never** substituted for
  danger severity, confirmed or unverified status.

## Themes

The existing client-side preference is retained in `tr-theme`.
Choices: **Day**, **Mist**, **Night Ops**, **Auto**.
Auto tracks the OS. Values produce a consistent `data-theme` and dark class,
keeping incident map/theme listeners working.

Tokens include `--t-theme` and `--ease-theme`. Animate only surface,
border and foreground color for related UI elements, not all descendants.
Never animate status meaning in a way that delays accessibility. Honor
`prefers-reduced-motion: reduce` for every animated state.

## Contrast and accessibility

Aim for WCAG 2.2 AA: 4.5:1 for ordinary text, 3:1 for large text and
non-text essential UI. Specifically:
- Day primary buttons: white on `#0B6574`.
- Night Ops primary buttons: dark `#061D27` on bright `#48B5C6`.
- Night Ops confirmed seals: dark ink on bright green.
- Never use translucent white text over arbitrary incident imagery.
- Preserve keyboard focus rings, descriptive accessible names and
  visible statuses; use words and icons as well as color.
- Do not hide errors, emergency disclaimers, or verification state.

## Responsive decisions

- **Phone (<= 600px):** one column, touch targets >= 40px, wrapped text,
  no clipped controls or horizontally overflowing dialogs.
- **Tablet (601–1279px):** compact nav drawer; stacked workbench sections.
- **Desktop (>= 1280px):** full navigation when space permits; map and
  review panels retain their own responsive constraints.
- Respect 200% text zoom, dynamic viewport heights and safe-area insets.
- Full-width photo/video retains intrinsic aspect ratio.
- Theme choices must remain reachable within the responsive drawer.

## QA checklist

1. Check favicon and wordmark match at 16, 32 and 256 px, plus 8K vector export.
2. Test Day, Mist, Night Ops and Auto under both OS preferences.
3. Confirm text readability in cards, toasts, placeholders, map overlays,
   loading states, verification seals, dialogs and forms.
4. Exercise keyboard-only navigation and reduced-motion settings.
5. Check 320px, 375px, 768px, 1024px, 1280px and 1920px widths.
6. Run lint, TypeScript, unit tests and production build.
7. Keep report routing and authorization logic untouched in design-only PRs.
