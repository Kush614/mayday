export type Risk = "low" | "medium" | "high";

export type Assumption = {
  id: string;
  claim: string;
  basis_step: number | null;
  confidence: "stated" | "inferred";
};

export type Enrichment = {
  intent: string;
  alternatives: { description: string; why_rejected: string }[];
  assumptions: Assumption[];
  risk: Risk;
};

export type EventType =
  | "session_start"
  | "thought"
  | "tool_call"
  | "file_edit"
  | "shell_command"
  | "test_run"
  | "session_end";

export type TraceEvent = {
  v: 1;
  session_id: string;
  step: number;
  ts: string;
  type: EventType;
  data: any;
  enrichment?: Enrichment;
};

export type TraceSummary = {
  session_id: string;
  task: string;
  model: string;
  started_at: string;
  steps: number;
  enriched: boolean;
  golden: boolean;
  path: string;
};

export type Candidate = { step: number; path: string; line: number; risk: string | null; score: number; reason: string };

export type IncidentResult = {
  failure: { kind: string; message: string; text: string };
  session_id: string;
  step: number;
  step_summary: string;
  assumption: Assumption | null;
  basis_step: number | null;
  basis_summary: string | null;
  verdict: string;
  corrected_belief?: string;
  correction: string;
  confidence: string;
  candidates: Candidate[];
  elapsed_ms: number;
};

export type ReplayResult = {
  ok?: boolean;
  status?: string;
  tests_passed?: boolean;
  test_output?: string;
  diff?: string;
  duration_s?: number;
  error?: string;
  fallback_command?: string;
};
