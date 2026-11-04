# TerraResponse AI — Meta Global AI Developer Hackathon 2026

**Theme:** Build for Your World  
**Video:** https://youtu.be/MldyTvwECMo (exact 3:00-minute walkthrough)  
**Demo site:** https://terra-response-ai.vercel.app/  
**Source:** https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026

## The problem

During emergencies, photos can be shared faster than volunteers or moderators can interpret them. Location context may be incomplete, evidence may be uncertain, and automated severity classifications may be inaccurate. TerraResponse AI explores a **human-in-the-loop, evidence-first** approach to structuring reports without treating model outputs as verified facts.

## The product — what users can do

1. **Report:** An authorized user uploads a photo, adds factual details and supplies EXIF GPS, browser-permission coordinates, a MapLibre map pin or an explicitly unknown location. Images are privately stored.
2. **Analyze:** **Meta Muse Spark 1.3** is asked to return provisional visual observations and uncertainty using the Meta Model API. Structured output is separately validated. If inference fails, the saved report remains available for human review rather than being marked as AI-verified.
3. **Review:** An independent, event-authorized reviewer can inspect evidence, confirm, correct, flag or reject a report. Decisions use an atomic review state and an audit trail, subject to actual role permissions and database restrictions.
4. **Inspect optional masks:** A reviewer can opt into **Meta SAM 3.1** for a specific visible object (for example, collapsed debris or floodwater). The app uses the Meta parser to decode actual model masks. No mask is displayed when the response is invalid, unavailable or no match. A mask does **not** verify where or when a photo was taken.
5. **Explore:** The geospatial interface uses MapLibre with a separate place-name geocoder, source-specific locations and a reviewed-report index. A map marker does not prove a disaster happened there.

## Meta AI features: exact scope

| Feature | Meta API | Runtime use | Demonstration caveat |
| --- | --- | --- | --- |
| **Muse Spark 1.3 — photo understanding** | `POST /v1/chat/completions` | Provisional incident category, visible evidence, severity and uncertainty; JSON-schema request plus independent Zod validation | The published video shows an AI-unavailable fallback, **not** a successful inference in that sample. |
| **SAM 3.1 — target-based segmentation** | `POST /v1/responses`, streamed | Explicit reviewer prompt to segment selected visual concepts; real decoded mask pixels over evidence photo | Optional, cost-limited and key-dependent; a successful paid live inference and rendered overlay have **not** been independently demonstrated in this video. |
| **Meta Muse Wonder, Muse Image, Muse Voice Transcribe** | Not integrated | Not used by this application | Do not list them as implemented hackathon functionality. |

### Why Meta models are meaningful

Muse Spark provides the initial *structured visual understanding* needed to make a photo easier to queue and inspect; its uncertainty and schema validation become visible constraints rather than hidden scores. SAM adds *optional, localized visual assistance* when a reviewer wants to inspect a particular object. These are **different capabilities**, not a claim that either model verifies authenticity, dispatches help or makes the final decision.

### Reliability and cost controls

- No automatic SAM request during ordinary upload, and no hidden paid retry loop when Muse fails.
- Saved reports and manual review remain available through AI degradation.
- Explicit rate/budget ceilings and idempotent state handling bound expensive calls; actual pricing and provider quotas still apply.
- Private evidence uses short-lived authorization-scoped delivery. Querying geographic place names does not forward private report images/descriptions to the geocoder.
- A sampled/default severity must never be shown as a confirmed model result when analysis failed.

## 3:00 demonstration video

The final narration and screen recording follow:

| Timestamp | Recorded story |
| --- | --- |
| 00:00–00:19 | Landing overview and purpose |
| 00:19–00:36 | Report workspace |
| 00:36–01:06 | Photo submission and location |
| 01:06–01:17 | Saved report |
| 01:17–01:33 | AI processing stage |
| 01:33–02:00 | **AI unavailable:** truthful manual-review fallback |
| 02:00–02:33 | Human verification interface and decision controls |
| 02:33–02:47 | Incident map |
| 02:47–03:00 | Privacy, uncertainty and closing |

The video is a product walkthrough. It **does not prove** that every displayed review action persisted, that a live Muse analysis completed, or that an external emergency was verified.

## Technology

Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/PostGIS/Storage/RLS, MapLibre, optional MapTiler geocoding, Meta Muse Spark and Meta SAM APIs, Zod, Sharp, Playwright/Vitest and Vercel.

## Safety, evidence, and present limitations

- **Decision support only.** Not an emergency response, medical triage, disaster-warning or responder-dispatch system.
- Photographs and reported coordinates may be inaccurate, historic, fictional, synthetic or unverified.
- Human confirmation records a *review decision*, not forensic proof of the photo's source, location or disaster status.
- Full signed-in two-pass staging acceptance and paid SAM mask demonstration have not been independently verified in the published demo.
- Open security issues must not be concealed as passed gates: [#21 email verification](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/21), [#23 privileged RPCs](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/23), [#30 migration ledger](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/30), [#42 role/login staging acceptance](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/42), [#48 moderation severity restrictions](https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026/issues/48).

## Judge-friendly links

- [Watch the 3-minute demo](https://youtu.be/MldyTvwECMo)
- [Open the live application](https://terra-response-ai.vercel.app/)
- [Read the repository README](../README.md)
- [Open the official project submission kit](HACKATHON_SUBMISSION_2026.md)
- [Inspect architecture](ARCHITECTURE.md)
- [Review security boundaries](SECURITY.md)
- [Review demo and fallback script](DEMO_SCRIPT.md)
