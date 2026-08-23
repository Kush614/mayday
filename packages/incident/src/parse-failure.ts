/**
 * Failure artifact → (path, line) candidates (SPEC §8 step 1).
 * Accepts a raw stack trace, test-runner output, or a Greptile review finding.
 */

export type FrameRef = {
  path: string;
  line: number;
  /** 0 = most specific frame; used for ranking. */
  rank: number;
  raw: string;
};

export type FailureArtifact = {
  kind: "stack_trace" | "test_output" | "greptile";
  text: string;
  frames: FrameRef[];
  message: string;
};

const NOISE = /node_modules|node:internal|^internal\/|\(node:/;

const PATTERNS: RegExp[] = [
  // at fn (/abs/path/file.ts:42:15)  |  at /abs/path/file.ts:42:15
  /\bat\s+(?:[^\s(]+\s+\()?([^\s():]+\.[a-zA-Z]{1,4}):(\d+)(?::\d+)?\)?/g,
  // vitest/jest frame markers: ❯ src/items.ts:42:15
  /[❯>]\s+([^\s:]+\.[a-zA-Z]{1,4}):(\d+)(?::\d+)?/g,
  // bare path:line[:col] anywhere (last resort)
  /(?:^|\s|\()([\w./\\-]+\.[a-zA-Z]{1,4}):(\d+)(?::\d+)?/g,
];

function firstMeaningfulLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^at\s/.test(t)) continue;
    return t.slice(0, 300);
  }
  return text.trim().slice(0, 300);
}

export function parseFrames(text: string): FrameRef[] {
  const seen = new Set<string>();
  const frames: FrameRef[] = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const path = m[1]!;
      const line = Number(m[2]);
      if (!Number.isFinite(line) || line <= 0) continue;
      if (NOISE.test(path)) continue;
      const key = `${path}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      frames.push({ path, line, rank: frames.length, raw: m[0].trim() });
    }
    // Frames from the more specific patterns win; stop once we have real ones.
    if (frames.length > 0) break;
  }
  return frames;
}

export function fromStackTrace(text: string): FailureArtifact {
  const isTestOutput = /(FAIL|✕|✗|AssertionError|expected .* to (be|equal))/i.test(text);
  return {
    kind: isTestOutput ? "test_output" : "stack_trace",
    text,
    frames: parseFrames(text),
    message: firstMeaningfulLine(text),
  };
}

export type GreptileFinding = {
  path: string;
  line_range: [number, number] | number[];
  comment: string;
  /** optional passthroughs from the PR review */
  pr?: number;
  url?: string;
};

export function fromGreptileFinding(finding: GreptileFinding): FailureArtifact {
  const [start, end] = [finding.line_range[0] ?? 1, finding.line_range[1] ?? finding.line_range[0] ?? 1];
  const frames: FrameRef[] = [];
  for (let line = start; line <= end && frames.length < 25; line++) {
    frames.push({ path: finding.path, line, rank: frames.length, raw: `${finding.path}:${line}` });
  }
  return {
    kind: "greptile",
    text: `Greptile review finding on ${finding.path}:${start}-${end}\n\n${finding.comment}`,
    frames,
    message: finding.comment.slice(0, 300),
  };
}

/** Auto-detect: JSON Greptile finding vs raw text. */
export function parseFailure(input: string): FailureArtifact {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed);
      const finding = Array.isArray(json) ? json[0] : json;
      if (finding && typeof finding === "object" && "path" in finding && "comment" in finding) {
        return fromGreptileFinding(finding as GreptileFinding);
      }
    } catch {
      // fall through to text parsing
    }
  }
  return fromStackTrace(input);
}
