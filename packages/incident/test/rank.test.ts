import { describe, it, expect, beforeEach } from "vitest";
import { unifiedDiff, diffLines, addedRanges } from "@afr/recorder";
import type { TraceEvent } from "@afr/recorder/schema";
import { openIndex, indexTrace, type Db } from "@afr/enricher";
import { rankCandidates } from "../src/analyze.js";
import { parseFailure } from "../src/parse-failure.js";

const PATH = "src/items.ts";
const SESSION = "01TESTSESSION";

/** A file long enough that line numbers mean something. */
function base(): string {
  return [...Array(40)].map((_, i) => `const line${i + 1} = ${i + 1};`).join("\n") + "\n";
}

function withOwnerLine(): string {
  const lines = base().split("\n");
  lines.splice(41, 0, `  owner: \`user-\${row.user_id.toString()}\`,`);
  return lines.join("\n");
}

function event(step: number, before: string, after: string, risk: "low" | "high"): TraceEvent {
  return {
    v: 1,
    session_id: SESSION,
    step,
    ts: new Date(step * 1000).toISOString(),
    type: "file_edit",
    data: { path: PATH, diff: unifiedDiff(PATH, before, after), lines_added: addedRanges(diffLines(before, after)) },
    enrichment: {
      intent: `step ${step}`,
      alternatives: [],
      risk,
      assumptions: [
        {
          id: `${SESSION}:${step}:0`,
          claim: "items.user_id is never NULL",
          basis_step: step > 5 ? 5 : null,
          confidence: "inferred",
        },
      ],
    },
  };
}

const events: TraceEvent[] = [
  {
    v: 1,
    session_id: SESSION,
    step: 1,
    ts: new Date(0).toISOString(),
    type: "session_start",
    data: { task: "add pagination", cwd: "/app", git_sha: "abc1234", model: "codex" },
  },
  event(4, "", base(), "low"),
  event(14, base(), withOwnerLine(), "high"),
];

let db: Db;
beforeEach(() => {
  db = openIndex(":memory:");
  indexTrace(db, events, "traces/test.jsonl");
});

describe("incident ranking", () => {
  it("maps a stack frame to the step that wrote that line", () => {
    const artifact = parseFailure(
      `TypeError: Cannot read properties of null (reading 'toString')\n    at toDTO (/Users/x/app/src/items.ts:42:29)`,
    );
    const ranked = rankCandidates(db, SESSION, artifact, 14);
    expect(ranked[0]!.step).toBe(14);
    expect(ranked[0]!.path).toBe(PATH);
    expect(ranked[0]!.line).toBe(42);
  });

  it("resolves absolute and compiled paths back to the recorded relative path", () => {
    for (const frame of ["/Users/x/app/src/items.ts:42", "dist/src/items.js:42", "src/items.ts:42"]) {
      const ranked = rankCandidates(db, SESSION, parseFailure(`    at fn (${frame}:1)`), 14);
      expect(ranked[0]?.step, frame).toBe(14);
    }
  });

  it("prefers the crashing frame over its callers", () => {
    const artifact = parseFailure(
      `TypeError: boom\n    at toDTO (/app/src/items.ts:42:29)\n    at listItems (/app/src/items.ts:10:26)`,
    );
    const ranked = rankCandidates(db, SESSION, artifact, 14);
    expect(ranked[0]!.step).toBe(14);
    expect(ranked.map((c) => c.step)).toContain(4);
  });

  it("returns nothing when the failure points at code the agent never wrote", () => {
    const ranked = rankCandidates(db, SESSION, parseFailure(`    at boot (/app/src/untouched.ts:3:1)`), 14);
    expect(ranked).toHaveLength(0);
  });

  it("indexes assumptions per step", () => {
    const rows = db.prepare(`SELECT step, basis_step FROM assumptions WHERE session_id = ? ORDER BY step`).all(SESSION) as {
      step: number;
      basis_step: number | null;
    }[];
    expect(rows.map((r) => r.step)).toEqual([4, 14]);
    expect(rows[1]!.basis_step).toBe(5);
  });
});
