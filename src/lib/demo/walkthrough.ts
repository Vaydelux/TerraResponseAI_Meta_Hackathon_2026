import { SAMPLE_OBSERVATIONS, SAMPLE_UNCERTAINTIES } from "@/components/landing/sample-data";

export const DEMO_REPORT = {
  id: "sample-report-001",
  title: "Water across a residential road",
  reporter: "Sample reporter",
  reviewer: "Sample reviewer (simulated role)",
  location: { latitude: 14.6, longitude: 120.98 },
  observations: SAMPLE_OBSERVATIONS,
  uncertainties: SAMPLE_UNCERTAINTIES,
  summary: "Water appears to cover the road; depth and safe access remain unknown.",
  summaryTl: "Mukhang may tubig sa kalsada; hindi tiyak ang lalim o kaligtasan ng daan.",
} as const;

export type DemoScenario = "sample-analysis" | "ai-unavailable";
export type DemoStage = "report" | "observation" | "review" | "map";
export interface DemoDecision {
  action: "confirm" | "reject";
  note: string;
}
export interface DemoState {
  stage: DemoStage;
  scenario: DemoScenario;
  decision: DemoDecision | null;
}
export type DemoAction =
  | { type: "scenario"; scenario: DemoScenario }
  | { type: "submit" }
  | { type: "review" }
  | { type: "decide"; decision: DemoDecision }
  | { type: "reset" };

export const INITIAL_DEMO: DemoState = { stage: "report", scenario: "sample-analysis", decision: null };

// One isolated in-memory adapter. No API, account state or storage is involved.
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "reset": return { ...INITIAL_DEMO };
    case "scenario": return state.stage === "report" ? { ...state, scenario: action.scenario } : state;
    case "submit": return state.stage === "report" ? { ...state, stage: "observation" } : state;
    case "review": return state.stage === "observation" ? { ...state, stage: "review" } : state;
    case "decide": {
      const note = action.decision.note.trim();
      if (state.stage !== "review" || note.length < 12 || note.length > 400) return state;
      return { ...state, stage: "map", decision: { action: action.decision.action, note } };
    }
  }
}
