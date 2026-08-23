/**
 * Trace schema — SPEC.md §4. FROZEN.
 * Changing anything here means updating SPEC.md §4 and every golden trace in
 * demo/traces/. Don't do it casually.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const SessionStart = z.object({
  task: z.string(),
  cwd: z.string(),
  git_sha: z.string(),
  model: z.string(),
});

export const Thought = z.object({
  text: z.string(),
});

export const ToolCall = z.object({
  name: z.string(),
  input: z.unknown(),
  output_summary: z.string(),
});

/** Ranges are [startLine, endLine] inclusive, in the POST-edit file. */
export const LineRange = z.tuple([z.number().int(), z.number().int()]);

export const FileEdit = z.object({
  path: z.string(),
  diff: z.string(),
  lines_added: z.array(LineRange),
  /** content hash of the post-edit file in traces/<session>/blobs/ */
  blob: z.string().optional(),
});

export const ShellCommand = z.object({
  command: z.string(),
  exit_code: z.number().int(),
  output_tail: z.string(),
});

export const TestRun = z.object({
  command: z.string(),
  passed: z.boolean(),
  output_tail: z.string(),
});

export const SessionEnd = z.object({
  final_diff: z.string(),
  files_touched: z.array(z.string()),
  duration_s: z.number(),
});

export const Assumption = z.object({
  /** `${session_id}:${step}:${i}` */
  id: z.string(),
  claim: z.string(),
  basis_step: z.number().int().nullable(),
  confidence: z.enum(["stated", "inferred"]),
});

export const Alternative = z.object({
  description: z.string(),
  why_rejected: z.string(),
});

export const Enrichment = z.object({
  intent: z.string(),
  alternatives: z.array(Alternative).max(3),
  assumptions: z.array(Assumption),
  risk: z.enum(["low", "medium", "high"]),
});

export const EventType = z.enum([
  "session_start",
  "thought",
  "tool_call",
  "file_edit",
  "shell_command",
  "test_run",
  "session_end",
]);

const envelope = {
  v: z.literal(SCHEMA_VERSION),
  session_id: z.string(),
  step: z.number().int().positive(),
  ts: z.string(),
  enrichment: Enrichment.optional(),
};

export const TraceEvent = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("session_start"), data: SessionStart }),
  z.object({ ...envelope, type: z.literal("thought"), data: Thought }),
  z.object({ ...envelope, type: z.literal("tool_call"), data: ToolCall }),
  z.object({ ...envelope, type: z.literal("file_edit"), data: FileEdit }),
  z.object({ ...envelope, type: z.literal("shell_command"), data: ShellCommand }),
  z.object({ ...envelope, type: z.literal("test_run"), data: TestRun }),
  z.object({ ...envelope, type: z.literal("session_end"), data: SessionEnd }),
]);

export type SessionStart = z.infer<typeof SessionStart>;
export type Thought = z.infer<typeof Thought>;
export type ToolCall = z.infer<typeof ToolCall>;
export type FileEdit = z.infer<typeof FileEdit>;
export type ShellCommand = z.infer<typeof ShellCommand>;
export type TestRun = z.infer<typeof TestRun>;
export type SessionEnd = z.infer<typeof SessionEnd>;
export type Assumption = z.infer<typeof Assumption>;
export type Alternative = z.infer<typeof Alternative>;
export type Enrichment = z.infer<typeof Enrichment>;
export type EventType = z.infer<typeof EventType>;
export type TraceEvent = z.infer<typeof TraceEvent>;

export type EventOfType<T extends EventType> = Extract<TraceEvent, { type: T }>;

/**
 * Parse one JSONL line. Returns null for blank lines; throws with the line
 * number for malformed ones so a bad trace fails loudly at load, not at render.
 */
export function parseTraceLine(line: string, lineNo: number): TraceEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`trace line ${lineNo}: invalid JSON (${(err as Error).message})`);
  }
  const parsed = TraceEvent.safeParse(json);
  if (!parsed.success) {
    throw new Error(`trace line ${lineNo}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

export function parseTrace(text: string): TraceEvent[] {
  return text
    .split("\n")
    .map((line, i) => parseTraceLine(line, i + 1))
    .filter((e): e is TraceEvent => e !== null);
}

export function serializeTrace(events: TraceEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
