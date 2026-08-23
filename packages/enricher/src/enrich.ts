import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { z } from "zod";
import type { TraceEvent, Enrichment } from "@afr/recorder/schema";
import { llmJson, defaultModel } from "./llm.js";
import { summarizeEvent, describeStep, windowBefore } from "./context.js";

const promptPath = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "enrich.md");

/** The model returns assumptions without ids; we assign them (SPEC §4). */
const ModelEnrichment = z.object({
  intent: z.string(),
  alternatives: z
    .array(z.object({ description: z.string(), why_rejected: z.string() }))
    .max(3)
    .default([]),
  assumptions: z
    .array(
      z.object({
        claim: z.string(),
        basis_step: z.union([z.number().int(), z.null()]).default(null),
        confidence: z.enum(["stated", "inferred"]).default("inferred"),
      }),
    )
    .default([]),
  risk: z.enum(["low", "medium", "high"]).default("low"),
});

let cachedPrompt: { system: string; user: string } | null = null;

function loadPrompt(): { system: string; user: string } {
  if (cachedPrompt) return cachedPrompt;
  const md = readFileSync(promptPath, "utf8");
  const system = md.split("## System")[1]?.split("## User")[0]?.trim() ?? "";
  const user = md.split("## User")[1]?.trim() ?? "";
  if (!system || !user) throw new Error(`prompts/enrich.md is missing a ## System or ## User section`);
  cachedPrompt = { system, user };
  return cachedPrompt;
}

/** Steps worth an LLM call — session_start/end carry no decision to audit. */
export function isEnrichable(e: TraceEvent): boolean {
  return e.type === "thought" || e.type === "tool_call" || e.type === "file_edit" || e.type === "shell_command";
}

export async function enrichStep(events: TraceEvent[], index: number, model?: string): Promise<Enrichment> {
  const event = events[index]!;
  const task = events.find((e) => e.type === "session_start")?.data.task ?? "(unknown task)";
  const { system, user } = loadPrompt();

  const context = windowBefore(events, index).map(summarizeEvent).join("\n\n") || "(this is the first step)";
  const filled = user
    .replace("{{task}}", task)
    .replace("{{context}}", context)
    .replace("{{step}}", String(event.step))
    .replace("{{type}}", event.type)
    .replace("{{step_payload}}", describeStep(event));

  const raw = await llmJson({
    system,
    user: filled,
    schema: ModelEnrichment,
    model: model ?? defaultModel("enrich"),
  });

  return {
    intent: raw.intent,
    alternatives: raw.alternatives,
    risk: raw.risk,
    assumptions: raw.assumptions.map((a, i) => ({
      id: `${event.session_id}:${event.step}:${i}`,
      claim: a.claim,
      // A basis step must point backwards at a real step, else it is noise.
      basis_step: a.basis_step !== null && a.basis_step > 0 && a.basis_step < event.step ? a.basis_step : null,
      confidence: a.confidence,
    })),
  };
}

export type EnrichProgress = { done: number; total: number; step: number; failed?: string };

/**
 * Enriches every eligible step in parallel. Failures are logged and skipped —
 * a partially enriched trace still renders (fail-soft rule).
 */
export async function enrichTrace(
  events: TraceEvent[],
  opts: { concurrency?: number; model?: string; onProgress?: (p: EnrichProgress) => void } = {},
): Promise<{ events: TraceEvent[]; enriched: number; failed: number }> {
  const limit = pLimit(opts.concurrency ?? 5);
  const targets = events.map((e, i) => ({ e, i })).filter(({ e }) => isEnrichable(e));
  let done = 0;
  let failed = 0;

  const out = events.map((e) => ({ ...e }) as TraceEvent);

  await Promise.all(
    targets.map(({ i }) =>
      limit(async () => {
        try {
          const enrichment = await enrichStep(events, i, opts.model);
          out[i]!.enrichment = enrichment;
          done++;
          opts.onProgress?.({ done, total: targets.length, step: events[i]!.step });
        } catch (err) {
          failed++;
          done++;
          opts.onProgress?.({ done, total: targets.length, step: events[i]!.step, failed: (err as Error).message });
        }
      }),
    ),
  );

  return { events: out, enriched: targets.length - failed, failed };
}
