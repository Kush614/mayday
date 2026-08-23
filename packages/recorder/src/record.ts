import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { ulid } from "ulid";
import { TraceEvent, serializeTrace, SCHEMA_VERSION, type EventOfType } from "./schema.js";
import { normalizeCodexEvent, looksLikeTestCommand, testPassed, tail, type NormalizedEvent } from "./codex.js";
import { unifiedDiff, diffLines, addedRanges } from "./diff.js";
import { putBlob } from "./blobs.js";
import { headSha, fileAtHead, workingDiff, filesTouched, isRepo } from "./git.js";
import { prepareWorkspace, applyWorkspace, type Workspace } from "./workspace.js";

export type RecordOptions = {
  task: string;
  targetDir: string;
  traceRoot: string;
  model?: string;
  codexBin?: string;
  /** codex exec sandbox policy; workspace-write is required for file edits. */
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  /** Repo root, used to link hoisted node_modules into the workspace. */
  repoRoot?: string;
  /** Capture in an isolated copy so the agent cannot read AFR's own repo. */
  isolate?: boolean;
  /** Copy the agent's changes back into the real target app afterwards. */
  apply?: boolean;
  extraArgs?: string[];
  onEvent?: (e: TraceEvent) => void;
};

export type RecordResult = {
  sessionId: string;
  tracePath: string;
  events: TraceEvent[];
  workspaceDir: string | null;
  applied: string[];
};

class TraceWriter {
  private step = 0;
  readonly events: TraceEvent[] = [];

  constructor(
    readonly sessionId: string,
    readonly tracePath: string,
    private readonly onEvent?: (e: TraceEvent) => void,
  ) {}

  /** Appends immediately: a crashed session still leaves a valid trace on disk. */
  push<T extends TraceEvent["type"]>(type: T, data: Extract<TraceEvent, { type: T }>["data"]): TraceEvent {
    this.step += 1;
    const event = {
      v: SCHEMA_VERSION,
      session_id: this.sessionId,
      step: this.step,
      ts: new Date().toISOString(),
      type,
      data,
    } as TraceEvent;
    this.events.push(event);
    appendFileSync(this.tracePath, JSON.stringify(event) + "\n", "utf8");
    this.onEvent?.(event);
    return event;
  }
}

/** Tracks the last content we saw per file so each edit diffs against the real predecessor. */
class FileSnapshots {
  private readonly seen = new Map<string, string>();
  constructor(private readonly targetDir: string) {}

  previous(relPath: string): string {
    const cached = this.seen.get(relPath);
    if (cached !== undefined) return cached;
    const baseline = isRepo(this.targetDir) ? fileAtHead(this.targetDir, relPath) : "";
    this.seen.set(relPath, baseline);
    return baseline;
  }

  current(relPath: string): string {
    const abs = join(this.targetDir, relPath);
    return existsSync(abs) ? readFileSync(abs, "utf8") : "";
  }

  commit(relPath: string, content: string): void {
    this.seen.set(relPath, content);
  }
}

function toRelative(targetDir: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(targetDir, p);
  const rel = relative(targetDir, abs);
  return rel.startsWith("..") ? p : rel;
}

export async function record(opts: RecordOptions): Promise<RecordResult> {
  const sourceDir = resolve(opts.targetDir);
  const traceRoot = resolve(opts.traceRoot);
  const sessionId = ulid();
  mkdirSync(join(traceRoot, sessionId), { recursive: true });

  const isolate = opts.isolate ?? true;
  let workspace: Workspace | null = null;
  if (isolate) {
    workspace = prepareWorkspace(sourceDir, traceRoot, sessionId, resolve(opts.repoRoot ?? join(sourceDir, "..", "..")));
  }
  const targetDir = workspace ? workspace.dir : sourceDir;
  const tracePath = join(traceRoot, `${sessionId}.jsonl`);
  const rawPath = join(traceRoot, sessionId, "raw.jsonl");
  writeFileSync(tracePath, "", "utf8");
  writeFileSync(rawPath, "", "utf8");

  const writer = new TraceWriter(sessionId, tracePath, opts.onEvent);
  const snapshots = new FileSnapshots(targetDir);
  const startedAt = Date.now();
  let model = opts.model ?? "codex";

  writer.push("session_start", {
    task: opts.task,
    cwd: targetDir,
    git_sha: headSha(targetDir),
    model,
  });

  const bin = opts.codexBin ?? process.env.AFR_CODEX_BIN ?? "codex";
  // `codex exec` sandboxes the agent read-only by default; without workspace-write
  // it can reason about the task but never edit a file, and the trace has no
  // file_edit events. Verified against codex-cli 0.149.0 (`codex exec --help`).
  const sandboxMode = opts.sandbox ?? process.env.AFR_CODEX_SANDBOX ?? "workspace-write";
  // Reasoning summaries are OFF by default: a plain `codex exec --json` run emits
  // zero `reasoning` items, which would leave the trace with no beliefs to audit
  // and the enricher with nothing to extract assumptions from. Verified on
  // codex-cli 0.149.0 — see docs/codex-event-map.md.
  const reasoningSummary = process.env.AFR_CODEX_REASONING_SUMMARY ?? "detailed";
  const reasoningEffort = process.env.AFR_CODEX_REASONING_EFFORT ?? "high";
  const args = [
    "exec",
    "--json",
    "--cd",
    targetDir,
    "--sandbox",
    sandboxMode,
    "-c",
    `model_reasoning_summary=${reasoningSummary}`,
    "-c",
    `model_reasoning_effort=${reasoningEffort}`,
    ...(opts.extraArgs ?? []),
    opts.task,
  ];

  const child = spawn(bin, args, {
    cwd: targetDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"], // stdin ignored: piped stdin makes codex wait for EOF
  });

  const stderrChunks: string[] = [];
  child.stderr.on("data", (c: Buffer) => {
    const text = c.toString();
    stderrChunks.push(text);
    process.stderr.write(text);
  });

  const emitFileChanges = (paths: string[]) => {
    for (const p of paths) {
      const rel = toRelative(targetDir, p);
      const before = snapshots.previous(rel);
      const after = snapshots.current(rel);
      if (before === after) continue;
      const diff = unifiedDiff(rel, before, after);
      const ranges = addedRanges(diffLines(before, after));
      const blob = putBlob(traceRoot, sessionId, after);
      snapshots.commit(rel, after);
      writer.push("file_edit", { path: rel, diff, lines_added: ranges, blob });
    }
  };

  const handle = (event: NormalizedEvent) => {
    switch (event.kind) {
      case "session":
        if (event.model) model = event.model;
        break;
      case "thought":
        if (event.text.trim()) writer.push("thought", { text: event.text });
        break;
      case "message":
        if (event.text.trim()) writer.push("thought", { text: event.text });
        break;
      case "command": {
        const isTest = looksLikeTestCommand(event.command);
        if (isTest) {
          writer.push("test_run", {
            command: event.command,
            passed: testPassed(event.command, event.exitCode, event.output),
            output_tail: tail(event.output),
          });
        } else {
          writer.push("shell_command", {
            command: event.command,
            exit_code: event.exitCode,
            output_tail: tail(event.output),
          });
        }
        // A shell command can also rewrite files (sed, codemods, generators).
        break;
      }
      case "file_change":
        emitFileChanges(event.paths);
        break;
      case "tool":
        writer.push("tool_call", {
          name: event.name,
          input: event.input,
          output_summary: tail(event.output, 10),
        });
        break;
      case "error":
        writer.push("tool_call", { name: "error", input: null, output_summary: event.message });
        break;
      case "turn_end":
      case "unknown":
        break;
    }
  };

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    appendFileSync(rawPath, line + "\n", "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Codex prints human-readable preamble lines before/around the JSON stream.
      process.stdout.write(line + "\n");
      continue;
    }
    const normalized = normalizeCodexEvent(parsed);
    if (normalized) handle(normalized);
  }

  const exitCode: number = await new Promise((res) => {
    child.on("close", (code) => res(code ?? 0));
    child.on("error", () => res(-1));
  });

  if (exitCode === -1) {
    throw new Error(
      `could not run \`${bin}\`. Install Codex CLI (npm i -g @openai/codex) or set AFR_CODEX_BIN.\n${stderrChunks.join("")}`,
    );
  }

  // Catch edits the event stream never announced (shell-driven writes, etc).
  emitFileChanges(filesTouched(targetDir));

  writer.push("session_end", {
    final_diff: workingDiff(targetDir),
    files_touched: filesTouched(targetDir),
    duration_s: Math.round((Date.now() - startedAt) / 10) / 100,
  });

  const applied =
    workspace && (opts.apply ?? true)
      ? applyWorkspace(
          workspace,
          writer.events.filter((e) => e.type === "file_edit").map((e) => (e as EventOfType<"file_edit">).data.path),
        )
      : [];

  return { sessionId, tracePath, events: writer.events, workspaceDir: workspace?.dir ?? null, applied };
}

export { serializeTrace };
