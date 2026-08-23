/**
 * Codex CLI event normalization.
 *
 * `codex exec --json` has shipped two event families and the CLI moves fast, so
 * this module is deliberately defensive: it recognizes both known shapes, and
 * anything unrecognized is preserved (never dropped) as a generic item. The raw
 * stream is always written to traces/<session>/raw.jsonl so the mapping can be
 * checked against the installed version — see docs/SPEC.md §5.
 *
 * Family A ("experimental JSON", current): {"type":"item.completed","item":{"item_type"|"type": ...}}
 * Family B ("protocol events", older):     {"id":"0","msg":{"type":"agent_reasoning", ...}}
 */

export type NormalizedEvent =
  | { kind: "session"; model?: string; sessionId?: string }
  | { kind: "thought"; text: string }
  | { kind: "message"; text: string }
  | { kind: "command"; command: string; exitCode: number; output: string }
  | { kind: "file_change"; paths: string[] }
  | { kind: "tool"; name: string; input: unknown; output: string }
  | { kind: "error"; message: string }
  | { kind: "turn_end"; usage?: unknown }
  | { kind: "unknown"; raw: unknown };

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined || v === null) return "";
  return JSON.stringify(v);
}

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function commandOf(obj: Record<string, unknown>): string {
  const c = obj["command"];
  if (Array.isArray(c)) return c.map((p) => String(p)).join(" ");
  if (typeof c === "string") return c;
  return firstString(obj, ["cmd", "call", "parsed_cmd"]);
}

function pathsOf(obj: Record<string, unknown>): string[] {
  const changes = obj["changes"];
  if (Array.isArray(changes)) {
    return changes
      .map((c) => (c && typeof c === "object" ? String((c as Record<string, unknown>)["path"] ?? "") : String(c)))
      .filter(Boolean);
  }
  // Older patch_apply_begin used an object keyed by path.
  if (changes && typeof changes === "object") return Object.keys(changes as Record<string, unknown>);
  const p = obj["path"] ?? obj["file"];
  return typeof p === "string" ? [p] : [];
}

/** Item-level normalization, shared by item.completed and bare item payloads. */
function normalizeItem(item: Record<string, unknown>): NormalizedEvent {
  const type = String(item["item_type"] ?? item["type"] ?? "");
  switch (type) {
    case "reasoning":
    case "agent_reasoning":
      return { kind: "thought", text: firstString(item, ["text", "summary", "content"]) };
    case "agent_message":
    case "assistant_message":
      return { kind: "message", text: firstString(item, ["text", "message", "content"]) };
    case "command_execution":
    case "local_shell_call":
      return {
        kind: "command",
        command: commandOf(item),
        exitCode: Number(item["exit_code"] ?? item["exitCode"] ?? 0),
        output: firstString(item, ["aggregated_output", "output", "stdout", "result"]),
      };
    case "file_change":
    case "patch_apply":
      return { kind: "file_change", paths: pathsOf(item) };
    case "mcp_tool_call":
    case "web_search":
    case "tool_call":
      return {
        kind: "tool",
        name: firstString(item, ["tool", "server", "name", "query"]) || type,
        input: item["arguments"] ?? item["input"] ?? item["query"] ?? null,
        output: firstString(item, ["result", "output", "status"]),
      };
    case "error":
      return { kind: "error", message: firstString(item, ["message", "error", "text"]) };
    case "todo_list":
      return { kind: "tool", name: "todo_list", input: item["items"] ?? null, output: "" };
    default:
      return { kind: "unknown", raw: item };
  }
}

/** Map one raw JSON line from the Codex stream to zero or one normalized events. */
export function normalizeCodexEvent(raw: unknown): NormalizedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Family B: { id, msg: { type, ... } }
  const msg = obj["msg"];
  if (msg && typeof msg === "object") {
    const m = msg as Record<string, unknown>;
    const t = String(m["type"] ?? "");
    switch (t) {
      case "session_configured":
      case "task_started":
        return { kind: "session", model: firstString(m, ["model"]), sessionId: firstString(m, ["session_id", "id"]) };
      case "agent_reasoning":
      case "agent_reasoning_delta":
        return { kind: "thought", text: firstString(m, ["text", "delta"]) };
      case "agent_message":
        return { kind: "message", text: firstString(m, ["message", "text"]) };
      case "exec_command_end":
        return {
          kind: "command",
          command: commandOf(m),
          exitCode: Number(m["exit_code"] ?? 0),
          output: firstString(m, ["aggregated_output", "stdout", "output"]),
        };
      case "patch_apply_end":
      case "patch_apply_begin":
        return { kind: "file_change", paths: pathsOf(m) };
      case "error":
      case "stream_error":
        return { kind: "error", message: firstString(m, ["message", "error"]) };
      case "task_complete":
        return { kind: "turn_end" };
      case "exec_command_begin":
      case "agent_reasoning_section_break":
      case "token_count":
      case "agent_message_delta":
        return null; // superseded by the *_end / completed event
      default:
        return { kind: "unknown", raw: obj };
    }
  }

  // Family A: { type: "item.completed" | "thread.started" | "turn.completed", ... }
  const type = String(obj["type"] ?? "");
  if (type === "item.completed" || type === "item.updated" || type === "item.started") {
    const item = obj["item"];
    if (!item || typeof item !== "object") return null;
    // Only completed items become trace steps; started/updated are progress noise.
    if (type !== "item.completed") return null;
    return normalizeItem(item as Record<string, unknown>);
  }
  if (type === "thread.started" || type === "session.created") {
    return { kind: "session", model: firstString(obj, ["model"]), sessionId: firstString(obj, ["thread_id", "session_id", "id"]) };
  }
  if (type === "turn.completed" || type === "turn.failed") {
    return { kind: "turn_end", usage: obj["usage"] };
  }
  if (type === "error") {
    return { kind: "error", message: firstString(obj, ["message", "error"]) };
  }
  if (obj["item_type"] || (obj["type"] && obj["id"] && !obj["msg"])) {
    return normalizeItem(obj);
  }
  return { kind: "unknown", raw: obj };
}

const TEST_PATTERNS = [/\bnpm\s+(run\s+)?test\b/, /\bvitest\b/, /\bjest\b/, /\bpytest\b/, /\bnpm\s+t\b/, /\byarn\s+test\b/, /\bprod-sim\b/];

export function looksLikeTestCommand(command: string): boolean {
  return TEST_PATTERNS.some((re) => re.test(command));
}

/** Test frameworks say "N failed"; also trust the exit code. */
export function testPassed(command: string, exitCode: number, output: string): boolean {
  if (exitCode !== 0) return false;
  return !/\b\d+\s+fail(ed|ing)\b/i.test(output);
}

export function tail(text: string, lines = 40): string {
  const parts = text.split("\n");
  return parts.length <= lines ? text : parts.slice(-lines).join("\n");
}
