import type { TraceEvent } from "@mayday/recorder/schema";

const MAX_FIELD = 1800;

function clip(text: string, max = MAX_FIELD): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… [${text.length - max} more chars]`;
}

/** One-line-ish digest of an event for the sliding context window. */
export function summarizeEvent(e: TraceEvent): string {
  switch (e.type) {
    case "session_start":
      return `step ${e.step} session_start: task=${JSON.stringify(e.data.task)} model=${e.data.model} sha=${e.data.git_sha.slice(0, 8)}`;
    case "thought":
      return `step ${e.step} thought: ${clip(e.data.text, 700)}`;
    case "tool_call":
      return `step ${e.step} tool_call ${e.data.name}: input=${clip(JSON.stringify(e.data.input ?? null), 400)} → ${clip(e.data.output_summary, 400)}`;
    case "file_edit":
      return `step ${e.step} file_edit ${e.data.path}:\n${clip(e.data.diff, 900)}`;
    case "shell_command":
      return `step ${e.step} shell_command \`${e.data.command}\` exit=${e.data.exit_code}\n${clip(e.data.output_tail, 500)}`;
    case "test_run":
      return `step ${e.step} test_run \`${e.data.command}\` ${e.data.passed ? "PASSED" : "FAILED"}\n${clip(e.data.output_tail, 500)}`;
    case "session_end":
      return `step ${e.step} session_end: files=${e.data.files_touched.join(", ")} duration=${e.data.duration_s}s`;
  }
}

/** Full payload of the step under audit — more detail than the context window. */
export function describeStep(e: TraceEvent): string {
  switch (e.type) {
    case "file_edit":
      return `path: ${e.data.path}\nlines added (post-edit): ${JSON.stringify(e.data.lines_added)}\ndiff:\n${clip(e.data.diff, 4000)}`;
    case "thought":
      return clip(e.data.text, 4000);
    case "tool_call":
      return `tool: ${e.data.name}\ninput: ${clip(JSON.stringify(e.data.input ?? null, null, 2), 2000)}\noutput: ${clip(e.data.output_summary, 2000)}`;
    case "shell_command":
      return `command: ${e.data.command}\nexit code: ${e.data.exit_code}\noutput:\n${clip(e.data.output_tail, 2000)}`;
    case "test_run":
      return `command: ${e.data.command}\nresult: ${e.data.passed ? "PASSED" : "FAILED"}\noutput:\n${clip(e.data.output_tail, 2000)}`;
    case "session_start":
      return `task: ${e.data.task}\ncwd: ${e.data.cwd}\nmodel: ${e.data.model}`;
    case "session_end":
      return `files touched: ${e.data.files_touched.join(", ")}\nfinal diff:\n${clip(e.data.final_diff, 3000)}`;
  }
}

export function windowBefore(events: TraceEvent[], index: number, size = 6): TraceEvent[] {
  return events.slice(Math.max(0, index - size), index);
}
