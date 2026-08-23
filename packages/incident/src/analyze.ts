/**
 * Incident engine (SPEC §8): failure artifact → candidate steps → the false
 * assumption behind the top step.
 */
import { z } from "zod";
import type { TraceEvent, Assumption } from "@mayday/recorder/schema";
import { llmJson, defaultModel, openIndex, lookupLine, resolvePath, summarizeEvent, describeStep, type Db } from "@mayday/enricher";
import type { FailureArtifact } from "./parse-failure.js";

export type Candidate = {
  step: number;
  path: string;
  line: number;
  risk: string | null;
  /** higher is more likely to be the culprit */
  score: number;
  reason: string;
};

const RISK_WEIGHT: Record<string, number> = { high: 30, medium: 15, low: 0 };

/**
 * Rank candidate steps: frame specificity first (the crashing frame beats its
 * callers), then enricher risk, then recency — later steps are likelier to hold
 * the freshly introduced bug.
 */
export function rankCandidates(db: Db, sessionId: string, artifact: FailureArtifact, totalSteps: number): Candidate[] {
  const byStep = new Map<number, Candidate>();

  for (const frame of artifact.frames) {
    const path = resolvePath(db, sessionId, frame.path);
    if (!path) continue;
    const hit = lookupLine(db, sessionId, path, frame.line);
    if (!hit) continue;

    const frameScore = Math.max(0, 100 - frame.rank * 20);
    const riskScore = RISK_WEIGHT[hit.risk ?? "low"] ?? 0;
    const recency = totalSteps > 0 ? (hit.step / totalSteps) * 20 : 0;
    const exactness = hit.line_no === frame.line ? 10 : 0;
    const score = frameScore + riskScore + recency + exactness;

    const existing = byStep.get(hit.step);
    if (existing && existing.score >= score) continue;
    byStep.set(hit.step, {
      step: hit.step,
      path,
      line: hit.line_no,
      risk: hit.risk,
      score,
      reason:
        hit.line_no === frame.line
          ? `wrote ${path}:${frame.line}`
          : `wrote ${path}:${hit.line_no}, ${Math.abs(hit.line_no - frame.line)} line(s) from the failing frame`,
    });
  }

  return [...byStep.values()].sort((a, b) => b.score - a.score);
}

const Verdict = z.object({
  assumption_id: z.string().nullable(),
  verdict: z.string(),
  /** One sentence of ground truth that replaces the false belief. */
  corrected_belief: z.string().default(""),
  suggested_correction: z.string(),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});
export type Verdict = z.infer<typeof Verdict>;

const SYSTEM = `You are a post-incident analyst for AI coding agents.
You are given a production failure and ONE step from the agent session that wrote
the failing line, including the assumptions that step depended on.

Decide which single assumption is most likely FALSE and caused this failure.
- assumption_id: the id of that assumption, or null if none of them explain it.
- verdict: two or three sentences — what the agent believed, what is actually
  true, and how that produced this exact failure. Reference concrete symbols.
- corrected_belief: ONE sentence stating what is actually true, written to stand
  directly against the false assumption — same subject, corrected claim. No
  preamble, no instruction, just the true statement about the system.
- suggested_correction: ONE paragraph written as an instruction to the agent for
  a re-run: state the corrected fact and what the code must do instead. It will
  be appended to the original task, so make it self-contained and imperative.
- confidence: how strongly the evidence supports this attribution.
Return JSON with exactly these five keys.`;

export type IncidentResult = {
  failure: { kind: string; message: string; text: string };
  /** The belief as recorded (false) and the ground truth that replaces it. */
  corrected_belief: string;
  session_id: string;
  step: number;
  step_summary: string;
  assumption: Assumption | null;
  basis_step: number | null;
  basis_summary: string | null;
  verdict: string;
  correction: string;
  confidence: string;
  candidates: Candidate[];
  elapsed_ms: number;
};

export async function analyzeIncident(opts: {
  events: TraceEvent[];
  artifact: FailureArtifact;
  indexPath: string;
  model?: string;
}): Promise<IncidentResult> {
  const started = Date.now();
  const { events, artifact } = opts;
  const sessionId = events[0]!.session_id;
  const db = openIndex(opts.indexPath);

  try {
    const candidates = rankCandidates(db, sessionId, artifact, events[events.length - 1]?.step ?? events.length);
    if (candidates.length === 0) {
      throw new Error(
        `no step in this session wrote any line referenced by the failure (${artifact.frames.map((f) => `${f.path}:${f.line}`).slice(0, 5).join(", ") || "no frames parsed"})`,
      );
    }

    const top = candidates[0]!;
    const event = events.find((e) => e.step === top.step);
    if (!event) throw new Error(`step ${top.step} is indexed but missing from the trace`);

    const assumptions = event.enrichment?.assumptions ?? [];
    const stepSummary = summarizeEvent(event);

    let verdict: Verdict;
    if (assumptions.length === 0) {
      // Fail soft: no enrichment on this step still gives a useful answer.
      verdict = {
        assumption_id: null,
        verdict: `Step ${top.step} ${top.reason}, but it has no recorded assumptions (enrichment missing or empty), so no belief can be blamed.`,
        corrected_belief: "",
        suggested_correction: `Re-examine ${top.path} around line ${top.line} for the failure: ${artifact.message}`,
        confidence: "low",
      };
    } else {
      verdict = await llmJson({
        system: SYSTEM,
        model: opts.model ?? defaultModel("verdict"),
        schema: Verdict,
        user: [
          `Failure (${artifact.kind}):`,
          artifact.text.slice(0, 4000),
          ``,
          `The failing line was written by step ${top.step} (${top.reason}).`,
          ``,
          `Step ${top.step} details:`,
          describeStep(event),
          ``,
          `Intent recorded for this step: ${event.enrichment?.intent ?? "(none)"}`,
          `Risk: ${event.enrichment?.risk ?? "unknown"}`,
          ``,
          `Assumptions this step depended on:`,
          ...assumptions.map((a) => `- id=${a.id} (${a.confidence}, basis_step=${a.basis_step ?? "none"}): ${a.claim}`),
        ].join("\n"),
      });
    }

    const assumption = assumptions.find((a) => a.id === verdict.assumption_id) ?? null;
    const basisStep = assumption?.basis_step ?? null;
    const basisEvent = basisStep !== null ? events.find((e) => e.step === basisStep) : undefined;

    return {
      failure: { kind: artifact.kind, message: artifact.message, text: artifact.text },
      session_id: sessionId,
      step: top.step,
      step_summary: stepSummary,
      assumption,
      basis_step: basisStep,
      basis_summary: basisEvent ? summarizeEvent(basisEvent) : null,
      verdict: verdict.verdict,
      corrected_belief: verdict.corrected_belief,
      correction: verdict.suggested_correction,
      confidence: verdict.confidence,
      candidates,
      elapsed_ms: Date.now() - started,
    };
  } finally {
    db.close();
  }
}
