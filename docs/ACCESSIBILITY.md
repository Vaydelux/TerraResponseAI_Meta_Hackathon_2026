# Accessibility Reference — TerraResponse AI

**Last updated:** 2026-10-29  
**Changelog:** Initial version. Organized from a raw feature list; merged 1 duplicate, flagged 6 issues. Revised per review feedback: corrected 1.4.11 vs 1.4.3 scope, separated motion sensitivity from seizure thresholds, clarified 3.3.4 Error Prevention, corrected 1.4.12 framing, expanded aria-controls caveat, excluded CLS from WCAG standards.

---

## Visual

### Color Contrast Ratios — Developer implementation

**What it does:** Ensures text and interface elements stand out from their backgrounds so they stay readable.  
**Who it helps:** Low vision, color vision deficiency, anyone in bright light.  
**Implementation notes:**  
- **Text:** Normal text ≥ 4.5:1. Large text (≥ 24 px, or ≥ 18.66 px bold) ≥ 3:1. For AAA, normal text ≥ 7:1 and large text ≥ 4.5:1.  
- **Non-text (UI components, graphics, borders, icons, focus rings):** ≥ 3:1 at all levels. This is a separate criterion from text contrast — do not conflate the two.  
**Standard:** 1.4.3 Contrast (Minimum) — text only, AA; 1.4.6 Contrast (Enhanced) — text only, AAA; 1.4.11 Non-text Contrast — UI components and graphics, AA.

---

### Forced Colors Mode — Developer implementation

**What it does:** Keeps content usable when the user's system overrides page colors, as in Windows High Contrast Mode.  
**Who it helps:** Low vision, light sensitivity.  
**Implementation notes:** Use `@media (forced-colors: active)`. Use system color keywords, keep borders visible (transparent borders become visible), and don't convey meaning through background images alone.  
**Standard:** Supports 1.4.11 Non-text Contrast and 1.4.1 Use of Color. No dedicated criterion.

---

### Inverted Colors / Grayscale — User setting

**What it does:** The operating system inverts colors or shows content in monochrome.  
**Who it helps:** Light sensitivity, visual fatigue, some users with cognitive or attention difficulties.  
**Implementation notes:** Test that layouts and contrast hold up when inverted. Don't rely on color alone to convey meaning. On iOS, images and video can be excluded from Smart Invert.  
**Standard:** None directly. Related: 1.4.1 Use of Color, A.

---

### Night Mode / Warmer Display — User setting

**What it does:** Shifts the display to warmer tones to reduce blue light.  
**Who it helps:** People with light sensitivity or eye discomfort in low light.  
**Implementation notes:** Handled by the OS or device. Developers can also offer a dark theme via `prefers-color-scheme`.  
**Standard:** None. ⚠️ This is a comfort feature, not a WCAG requirement.

---

### Text Resizing and Reflow — Developer implementation

**What it does:** Lets text scale up to 200% and content reflow at high zoom without clipping or overlap; works alongside screen magnifiers.  
**Who it helps:** Low vision.  
**Implementation notes:** Use relative units (`rem`, `em`, `clamp()` anchored in `rem`). Avoid fixed-height containers. Don't size text in `vw` alone. Content should reflow to a single column at 320 CSS px width (equivalent to 400% zoom).  
**Standard:** 1.4.4 Resize Text, AA; 1.4.10 Reflow, AA.

---

## Motion and Animation

### Reduced Motion — Developer implementation (driven by a user OS setting)

**What it does:** Removes or tones down non-essential animation, parallax, and large transitions when the user requests it.  
**Who it helps:** Vestibular disorders, motion sensitivity, migraines, attention difficulties.  
**Implementation notes:** Wrap or override animations in `@media (prefers-reduced-motion: reduce)`. This addresses vestibular comfort — it does not cover seizure thresholds. Flashing content is governed separately by 2.3.1 (below) and applies to all users regardless of this preference.  
**Standard:** 2.3.3 Animation from Interactions, AAA; 2.2.2 Pause, Stop, Hide, A.

### Flashing and Seizure Thresholds — Developer implementation

**What it does:** Prevents content from flashing at rates that could trigger photosensitive seizures.  
**Who it helps:** People with photosensitive epilepsy or seizure disorders.  
**Implementation notes:** Content must not flash more than three times per second, or flashes must be below the general flash and red flash thresholds. This applies to all users, not only those who set `prefers-reduced-motion`.  
**Standard:** 2.3.1 Three Flashes or Below Threshold, A; 2.3.2 Three Flashes, A.

---

## Keyboard and Focus

### Visible Focus States — Developer implementation

**What it does:** Shows which interactive element currently has keyboard focus.  
**Who it helps:** Keyboard-only users, low vision, motor impairments.  
**Implementation notes:** Never remove outlines without a replacement. Use `:focus-visible` with a high-contrast outline. Make sure sticky headers or banners don't cover the focused element.  
**Standard:** 2.4.7 Focus Visible, AA; 2.4.11 Focus Not Obscured (Minimum), AA; 2.4.13 Focus Appearance, AAA.

---

## Touch and Mobile

### Touch Target Size and Spacing — Developer implementation

**What it does:** Makes buttons and fields large and spaced enough to avoid accidental taps.  
**Who it helps:** Motor impairments, tremors, large fingers, anyone on a small screen.  
**Implementation notes:** Minimum 24 × 24 CSS px (or enough spacing around smaller targets). Aim for 44 × 44 CSS px or larger where possible.  
**Standard:** 2.5.8 Target Size (Minimum), AA; 2.5.5 Target Size (Enhanced), AAA.

---

## Screen Readers and Semantics

### Alternative Text (Alt Text) — Developer implementation

**What it does:** Gives a text equivalent for images so screen readers can convey them.  
**Who it helps:** Blind and low vision users, anyone with images disabled.  
**Implementation notes:** Concise alt text for informative images. Use `alt=""` for decorative images. Describe complex charts or diagrams in adjacent text.  
**Standard:** 1.1.1 Non-text Content, A.

---

### Screen Reader Support — Developer implementation (the screen reader itself is user software)

**What it does:** Makes pages work with VoiceOver, NVDA, JAWS, TalkBack, and similar tools.  
**Who it helps:** Blind and low vision users.  
**Implementation notes:** Provide meaningful page titles, a `lang` attribute, landmarks (`header`, `nav`, `main`, `footer`), alt text, and accessible names for controls. Test with real screen readers.  
**Standard:** 2.4.2 Page Titled, A; 3.1.1 Language of Page, A; 2.4.1 Bypass Blocks, A; 4.1.2 Name, Role, Value, A.

---

### Semantic Headings — Developer implementation

**What it does:** Provides a logical heading hierarchy (H1–H6) so users can navigate by section.  
**Who it helps:** Screen reader users, cognitive disabilities, anyone skimming.  
**Implementation notes:** Use real heading elements, not styled bold text. Don't skip levels. Use CSS for visual size.  
**Standard:** 1.3.1 Info and Relationships, A; 2.4.6 Headings and Labels, AA; 2.4.10 Section Headings, AAA.

---

## ARIA

> **First rule of ARIA:** Use native HTML elements (`button`, `nav`, `details`) before adding ARIA. Incorrect ARIA is worse than none.

### ARIA Roles and Attributes — Developer implementation

**What it does:** Adds role, state, and property information to custom widgets or dynamic content that native HTML can't express.  
**Who it helps:** Screen reader and other assistive technology users.  
**Implementation notes:** `role="…"` and `aria-*` attributes, kept in sync with actual UI state.  
**Standard:** 4.1.2 Name, Role, Value, A.

---

### Dynamic Announcements (aria-live) — Developer implementation

**What it does:** Announces updates (toasts, notifications, cart changes) without moving focus.  
**Who it helps:** Screen reader users.  
**Implementation notes:** `aria-live="polite"` for non-urgent updates and `"assertive"` for urgent ones. `role="status"` and `role="alert"` are common equivalents. The live region should exist in the DOM before its content changes.  
**Standard:** 4.1.3 Status Messages, AA.

---

### Labels and Descriptions — Developer implementation

**What it does:** Gives controls accessible names and ties extra help text to them.  
**Who it helps:** Screen reader users, speech-input users.  
**Implementation notes:** `aria-label` for icon-only buttons (e.g., a magnifying glass). `aria-describedby` to link inputs to hints or error messages. The visible text should be included in the accessible name.  
**Standard:** 4.1.2, A; 2.5.3 Label in Name, A.

---

### State and Relationship Properties — Developer implementation

**What it does:** Communicates widget state and relationships.  
**Who it helps:** Screen reader users.  
**Implementation notes:** `aria-expanded="true|false"` for accordions and disclosure buttons. `aria-haspopup` for menus. `aria-controls` links a trigger to the element it affects. ⚠️ `aria-controls` has poor screen reader support — do not rely on it alone. Provide a fallback such as `aria-expanded` and logical DOM order so the relationship is discoverable without it.  
**Standard:** 4.1.2, A.

---

## Forms and Error Handling

### Accessible Form Labels and Error Identification — Developer implementation

**What it does:** Pairs every field with a visible, programmatic label and identifies errors in text so users know what went wrong.  
**Who it helps:** Screen reader users, color vision deficiency, cognitive disabilities, everyone.  
**Implementation notes:** Use `<label for>` for each input. State what went wrong and how to fix it in text. Never use red borders alone — add an icon or text. Link errors via `aria-describedby` and set `aria-invalid="true"`. Announce errors via a live region or by moving focus to the error summary.  
**Standard:** 3.3.1 Error Identification, A; 3.3.2 Labels or Instructions, A; 3.3.3 Error Suggestion, AA; 1.4.1 Use of Color, A.

### Error Prevention for Critical Submissions — Developer implementation

**What it does:** For submissions that are legal, financial, or data-changing, allows the user to reverse, check, or confirm before final submission.  
**Who it helps:** Cognitive disabilities, motor impairments, anyone prone to mistakes.  
**Implementation notes:** At least one of: submissions are reversible; data is validated and errors are presented for review before submission; or the user can review and confirm before finalizing. This is distinct from error identification (3.3.1) — it is about preventing irreversible mistakes.  
**Standard:** 3.3.4 Error Prevention (Legal, Financial, Data), AA.

---

## Typography and Readability

### Readable Typography and Text Spacing — Developer implementation

**What it does:** Keeps text readable and layouts intact when users override spacing.  
**Who it helps:** Dyslexia, low vision, cognitive disabilities.  
**Implementation notes:** WCAG does not require specific spacing values by default. It requires that content does not break when users apply overrides: line height to 1.5×, paragraph spacing to 2×, letter spacing to 0.12×, and word spacing to 0.16× the font size. Use fluid, `rem`-based type so users can also zoom to 200% (1.4.4).  
**Standard:** 1.4.12 Text Spacing, AA; 1.4.4 Resize Text, AA.

---

### Reader Mode — User setting

**What it does:** Browser feature that strips navigation, ads, and sidebars to show only the main text.  
**Who it helps:** Low vision, dyslexia, attention difficulties.  
**Implementation notes:** Support it with clean semantic markup (`article`, `main`, proper headings).  
**Standard:** None.

---

## Cognitive and Predictability

### Predictability and Consistency — Developer implementation

**What it does:** Keeps navigation and behavior consistent and avoids surprise changes.  
**Who it helps:** Cognitive and learning disabilities, screen reader users, low vision.  
**Implementation notes:** Keep navigation order and labels uniform across pages. Don't trigger context changes on focus or input alone. Avoid unexpected popups and automatic refreshes. Let users extend or control time limits.  
**Standard:** 3.2.3 Consistent Navigation, AA; 3.2.4 Consistent Identification, AA; 3.2.1 On Focus, A; 3.2.2 On Input, A; 2.2.1 Timing Adjustable, A.

> **Note:** Layout shift (CLS) is a Core Web Vitals performance metric, not a WCAG criterion. It is excluded from the standards list above. It may affect user experience and should be minimized, but it is not an accessibility compliance requirement.
