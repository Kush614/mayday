import { describe, it, expect } from "vitest";
import { unifiedDiff, diffLines, addedRanges, parseUnifiedDiff } from "@mayday/recorder";
import { applyEdit, buildLineOrigin, PRE_EXISTING } from "../src/line-history.js";
import type { TraceEvent } from "@mayday/recorder/schema";

function edit(step: number, path: string, before: string, after: string): TraceEvent {
  return {
    v: 1,
    session_id: "S",
    step,
    ts: new Date(step * 1000).toISOString(),
    type: "file_edit",
    data: { path, diff: unifiedDiff(path, before, after), lines_added: addedRanges(diffLines(before, after)) },
  };
}

describe("diff", () => {
  it("produces added ranges in post-edit coordinates", () => {
    const before = "a\nb\nc\n";
    const after = "a\nX\nY\nb\nc\n";
    expect(addedRanges(diffLines(before, after))).toEqual([[2, 3]]);
  });

  it("round-trips through the unified diff parser", () => {
    const diff = unifiedDiff("f.ts", "a\nb\nc\n", "a\nb2\nc\n");
    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines.filter((l) => l.startsWith("+"))).toEqual(["+b2"]);
  });

  it("handles a brand new file", () => {
    const diff = unifiedDiff("new.ts", "", "one\ntwo\n");
    expect(parseUnifiedDiff(diff)[0]!.lines).toEqual(["+one", "+two"]);
  });
});

describe("line-history replay over three synthetic edits", () => {
  const path = "src/items.ts";
  const v0 = ["export function list() {", "  return db.all();", "}", ""].join("\n");
  const v1 = ["export function list() {", "  const rows = db.all();", "  return rows;", "}", ""].join("\n");
  const v2 = [
    "export function list(page: number) {",
    "  const rows = db.all();",
    "  return rows.slice(page * 10, page * 10 + 10);",
    "}",
    "",
  ].join("\n");

  const events = [edit(4, path, v0, v1), edit(9, path, v1, v2)];

  it("attributes each line to the step that last wrote it", () => {
    const origins = buildLineOrigin(events);
    const byLine = new Map(origins.map((o) => [o.line_no, o.step]));
    expect(byLine.get(1)).toBe(9); // signature rewritten in step 9
    expect(byLine.get(2)).toBe(4); // `const rows` introduced in step 4, untouched since
    expect(byLine.get(3)).toBe(9); // pagination line
    expect(byLine.has(4)).toBe(false); // closing brace is pre-existing
  });

  it("shifts ownership down when earlier lines are inserted", () => {
    const withPrefix = [
      ...events,
      edit(12, path, v2, ["// header", "// header 2", ...v2.split("\n")].join("\n")),
    ];
    const byLine = new Map(buildLineOrigin(withPrefix).map((o) => [o.line_no, o.step]));
    expect(byLine.get(1)).toBe(12);
    expect(byLine.get(2)).toBe(12);
    expect(byLine.get(3)).toBe(9); // the step-9 signature moved from line 1 → 3
    expect(byLine.get(4)).toBe(4);
    expect(byLine.get(5)).toBe(9);
  });

  it("leaves untouched files and pre-existing lines unattributed", () => {
    const owners = applyEdit([], unifiedDiff("x.ts", "a\nb\n", "a\nb\nc\n"), 7);
    expect(owners[0]).toBe(PRE_EXISTING);
    expect(owners[2]).toBe(7);
  });
});
