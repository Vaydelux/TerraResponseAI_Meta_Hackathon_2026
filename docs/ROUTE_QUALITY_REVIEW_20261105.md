# TerraResponse AI — Route and trust hardening audit (2026-11-05)

**Baseline:** PR #67 implementation branch. **Evidence type:** source-level audit, targeted unit tests, CI and public browser smoke as reported by the exact commit. This is NOT a signed-in cross-role visual acceptance certificate.

## Executed hardening
- Incident threads: remove fabricated flooding categories, arbitrary location placeholders and unproven geographic groupings. Where persisted threads are absent, show actual report entries individually, visibly labeled as not correlated. A missing database query produces unavailable state, not an invented zero.
- Notifications: separate persisted inbox counts and unread status from RLS-authorized read-only report activity. No mark-as-read action for derived activity.
- Admin AI usage: use real global UTC-day totals and ceiling fields from the existing admin API, not copied global numbers masquerading as per-user/event spend; explicit unavailable/error state and manual retry.
- Model economics: correct default Muse Spark Standard token rates to $1.25 input / $4.25 output per million (verified against Meta Model API pricing, November 5, 2026), with environment overrides. Keep private evidence in Standard, not Contributor. Skip model-price estimates for cache hits, rate-denied and budget-denied calls; keep actual failed paid attempts conservatively estimated. Old telemetry costs are not backfilled.
- Review queue: 320–1023px stacked, readable cards with a full-width 44px review link; desktop retains original table. Desktop J/K shortcuts do not intercept mobile touch layouts.
- Audit governance: real ARIA tablist/tabpanel, roving keyboard focus (Home/End/Arrow keys), mobile horizontal tab scroller. Read-only event management remains explicitly read-only.
- Filters and location: 44px reset/preset targets, clarify location pad is schematic and sample coordinates are not measured GPS locations. No recorded coordinate is invented by this UI.
- Dedicated incident map: world overview if no located reports (not a made-up default incident city), report-only recenter, contextual data cannot be requested on an empty map, reviewer links only for reviewable statuses, improved touch action dimensions. Existing verified-report text index is retained when tiles fail.

## Route-level status from code inspection
| Route group | Verified in source | Still needs signed-in cross-device exercise |
| --- | --- | --- |
| Landing / | Fictional map preview labeled, auth CTA, poster fallback | Actual media rendering & contrast at 320/768/1440 |
| Login / Signup / Recovery | Form validation/error handling and current brand assets exist | Real SMTP confirmation, password reset, keyboard/mobile screenshots; issue #21 |
| Dashboard | RLS event snapshot, filter, map, timeline, queue, pin shortlist | Expanded sidebar at 1024/1280/1440, live map tile failure |
| Map | Authoritative loaded report snapshot, map controls, reviewed map index | WebGL marker rendering with real authorized data, low-memory behavior |
| Reports list / detail | Private evidence and report status components | Real thumb errors, 320px long titles, list/grid with 100+ |
| Upload | File → manually checked location → persisted report and review handoff | Real offline→reconnect and duplicate submit staging test |
| Review queue | Auth-restricted route, data-error handling, mobile cards and desktop table | Reviewer account at 320/768, keyboard navigation and real review |
| Review workbench | Authorized report details, human decision API and optional SAM | Real independent reviewer decision, mask latency and evidence retention |
| Incident threads | Persisted thread when available, independently labeled stored-report fallback | Real temporal/geographic correlation and event-locked permissions |
| Notifications | Persisted inbox metrics, distinct report activity, truthful errors | Actual user read/unread transactions and event delivery |
| Profile | RLS-scoped reports and role display | Long names/empty state + mobile touch controls |
| Audit log / Events / Spend | Keyboard tabs, read-only events, genuine daily global AI spend | Non-admin access, 100+ rows, accurate per-event/per-user query still unavailable |
| Admin users | Role-management feature gated server-side | Admin-only transaction, demotion, narrow layouts |

## API and security boundaries that remain
- No production Supabase mutation or fake emergency data. Existing production database has no reports.
- Two consecutive real staging reporter → Muse Spark → independent reviewer → map runs are still **NOT verified** as part of this PR.
- Legacy auth verification #21 and staging migration issue #30 remain open.
- App estimates recorded cost, not the invoice; existing rate overrides and historical telemetry may differ from new defaults.
- A human reviewer action records the decision; it does not independently authenticate an incident photograph, dispatch responders or establish emergency truth.
- A verified report index is an accessible fallback, not proof that WebGL rendered the expected pin.
- Open risks: audit/event table mobile cards, large-list virtualization, duplicate thumbnail fetches in alternate review renderings, device real-world contrast checks, and end-to-end reliability under live provider timeouts. Avoid “enterprise ready” until validated.

## 2–3 minute demonstration script
“TerraResponse AI accepts a consented or clearly synthetic test photo from a reporter and stores it with a manually verified location. Meta Muse Spark returns a provisional classification and its uncertainties, never a confirmed disaster. A different authorized reviewer inspects the same private evidence and makes a durable confirm, correct or reject decision. The reviewed located report then becomes distinguishable in the incident map and accessible report index; unreviewed images remain provisional. If AI or map tiles fail, the saved report and human-review options remain, while our fictional preview is explicitly identified as a sample—not a live emergency. This is evidence-informed decision support, not emergency dispatch.”

## Acceptance gate
Exact final-head lint, TypeScript, unit/integration and build + browser tests at public 320/768/1440 must pass. For complete project sign-off, test authenticated reporter/reviewer/admin routes at 320/480/768/1024/1280/1440 and two consecutive *real* protected staging acceptance runs, with independent reviewer audit and map marker proof.
