/**
 * Minimal line diff: LCS → unified diff + post-edit added-line ranges.
 * We compute diffs ourselves instead of trusting whatever shape the agent CLI
 * reports, so `lines_added` is always in POST-edit coordinates (SPEC §4 rule).
 */

export type DiffOp =
  | { op: "eq"; oldLine: number; newLine: number; text: string }
  | { op: "del"; oldLine: number; text: string }
  | { op: "add"; newLine: number; text: string };

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  // A trailing newline yields a final "" which is not a line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Myers-free LCS via dynamic programming. Files here are small (demo app,
 * agent-edited sources); O(n*m) is fine and the code stays readable.
 */
export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length;
  const m = b.length;

  // Trim common prefix/suffix first — keeps the DP table small in practice.
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const rows = midA.length;
  const cols = midB.length;

  const lcs: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  for (let k = 0; k < start; k++) {
    ops.push({ op: "eq", oldLine: k + 1, newLine: k + 1, text: a[k]! });
  }

  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (midA[i] === midB[j]) {
      ops.push({ op: "eq", oldLine: start + i + 1, newLine: start + j + 1, text: midA[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ op: "del", oldLine: start + i + 1, text: midA[i]! });
      i++;
    } else {
      ops.push({ op: "add", newLine: start + j + 1, text: midB[j]! });
      j++;
    }
  }
  while (i < rows) {
    ops.push({ op: "del", oldLine: start + i + 1, text: midA[i]! });
    i++;
  }
  while (j < cols) {
    ops.push({ op: "add", newLine: start + j + 1, text: midB[j]! });
    j++;
  }

  for (let k = 0; k < n - endA; k++) {
    ops.push({ op: "eq", oldLine: endA + k + 1, newLine: endB + k + 1, text: a[endA + k]! });
  }

  return ops;
}

/** Contiguous [start, end] line ranges (1-based, inclusive) added in the new file. */
export function addedRanges(ops: DiffOp[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const op of ops) {
    if (op.op !== "add") continue;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === op.newLine - 1) last[1] = op.newLine;
    else ranges.push([op.newLine, op.newLine]);
  }
  return ranges;
}

/** Standard unified diff with N lines of context. */
export function unifiedDiff(path: string, oldText: string, newText: string, context = 3): string {
  const ops = diffLines(oldText, newText);
  if (!ops.some((o) => o.op !== "eq")) return "";

  type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; body: string[] };
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let trailingEq = 0;

  const pending: DiffOp[] = [];
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx]!;
    if (op.op === "eq") {
      if (current) {
        if (trailingEq < context) {
          current.body.push(` ${op.text}`);
          current.oldLines++;
          current.newLines++;
          trailingEq++;
        } else {
          hunks.push(current);
          current = null;
          trailingEq = 0;
          pending.length = 0;
          pending.push(op);
        }
      } else {
        pending.push(op);
        if (pending.length > context) pending.shift();
      }
      continue;
    }

    if (!current) {
      const firstOld = pending.length ? (pending[0] as Extract<DiffOp, { op: "eq" }>).oldLine : op.op === "del" ? op.oldLine : Math.max(1, (op as Extract<DiffOp, { op: "add" }>).newLine);
      const firstNew = pending.length ? (pending[0] as Extract<DiffOp, { op: "eq" }>).newLine : op.op === "add" ? op.newLine : Math.max(1, (op as Extract<DiffOp, { op: "del" }>).oldLine);
      current = { oldStart: firstOld, oldLines: 0, newStart: firstNew, newLines: 0, body: [] };
      for (const p of pending) {
        current.body.push(` ${p.text}`);
        current.oldLines++;
        current.newLines++;
      }
      pending.length = 0;
    }
    trailingEq = 0;
    if (op.op === "del") {
      current.body.push(`-${op.text}`);
      current.oldLines++;
    } else {
      current.body.push(`+${op.text}`);
      current.newLines++;
    }
  }
  if (current) hunks.push(current);

  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  for (const h of hunks) {
    out.push(`@@ -${h.oldLines === 0 ? h.oldStart - 1 : h.oldStart},${h.oldLines} +${h.newLines === 0 ? h.newStart - 1 : h.newStart},${h.newLines} @@`);
    out.push(...h.body);
  }
  return out.join("\n") + "\n";
}

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] };

/** Parse a unified diff back into hunks — used by the line-history replayer. */
export function parseUnifiedDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const line of diff.split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      if (current) hunks.push(current);
      current = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line === "" ) continue;
    if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) current.lines.push(line);
  }
  if (current) hunks.push(current);
  return hunks;
}
