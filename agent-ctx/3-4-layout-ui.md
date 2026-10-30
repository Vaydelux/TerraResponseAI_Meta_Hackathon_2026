# Task 3 + 4 — Layout + UI primitives

## Files created

### src/components/ui-tr/ (design-system primitives, parallel to src/components/ui/)
- Button.tsx — `.btn` variants (primary/danger/quiet, lg, block, busy, kbd hint, href-as-link)
- IconButton.tsx — `.icon-btn` (40×40 square, requires aria-label)
- Field.tsx — `.field` + `.input` / `.select` / `.textarea` (invalid prop drives aria-invalid)
- Segmented.tsx — `.segmented` (aria-pressed, block option)
- Tabs.tsx — Tabs built on Segmented (block)
- Tooltip.tsx — CSS-only `.ui-tr-tooltip` (no JS positioning)
- Popover.tsx — `.ui-tr-popover` (button-triggered, click-outside + ESC)
- Dialog.tsx — native `<dialog>` wrapper (`.dialog` chrome from components.css)
- Toast.tsx — tiny event emitter + `.toast-region` host (`toast.push/success/error`)
- EmptyState.tsx — `.empty` (title + desc + action)
- Skeleton.tsx — `.skeleton` + SkeletonRow
- Table.tsx — `.table` + THead/TBody/TR/TH/TD with `data-state` left-edge stripe
- Panel.tsx — `.panel` variants (default/flush/sunk + head row)
- index.ts — re-exports

### src/components/layout/
- AppShell.tsx — `.tr-shell` grid (topbar + demo-banner slot + main)
- TopBar.tsx — `.topbar` (Wordmark + nav links + EventSwitcher + ThemeToggle + UserMenu)
- Wordmark.tsx — `.wordmark` with inline SVG survey-corner glyph (amber hatch quadrant)
- ThemeToggle.tsx — day/night/auto Segmented (writes data-theme to <html>, persists to localStorage)
- EventSwitcher.tsx — popover listing user's events; writes `tr-active-event` cookie
- UserMenu.tsx — avatar + email popover (Profile + Sign out)
- DemoBanner.tsx — `.demo-banner` (reads isDemoMode() server-side)
- PageHeader.tsx — h1 + subtitle + actions row
- FilterRail.tsx — Status/Severity/Mine filters driving URL search params
- index.ts — re-exports

## CSS additions (globals.css)
- `.btn--sm`, `.icon-btn--sm` — small variants (toast buttons)
- `.segmented--block`, `.segmented__btn--block` — full-width segmented
- `.empty__title/__desc/__action` — empty state typography
- `.ui-tr-tooltip`, `.ui-tr-tooltip__tip--top/bottom` — CSS tooltip
- `.ui-tr-popover`, `.ui-tr-popover__trigger/body/body--bottom-*/__item/__sep` — popover
- toast button + icon color overrides

## Notes for next agents
- `toast.push/success/error` is the imperative API; `<ToastRegion />` is mounted once in the (app) layout.
- `useFilterParam(key)` from FilterRail is exported so custom filter controls can use the same URL-state hook.
- The Dialog component uses `HTMLDialogElement.showModal()` for proper modal semantics (ESC, focus trap, backdrop).
- EventSwitcher's cookie name is `tr-active-event` — the existing app-shell-client also used this name; keep it consistent.
