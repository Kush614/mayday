/**
 * Line-history replayer (SPEC §6).
 *
 * Replays every file_edit diff in step order and tracks, for each line of each
 * file, WHICH STEP last wrote it. Insertions shift the lines below them, which
 * is the whole point: a stack frame `items.ts:42` means nothing without this.
 *
 * Owner 0 means "existed before the session" — not attributable to the agent.
 */
import { parseUnifiedDiff } from "@afr/recorder";
import type { TraceEvent } from "@afr/recorder/schema";

export const PRE_EXISTING = 0;

/** owners[i] is the step that last wrote line i+1. */
export type Owners = number[];

export function applyEdit(owners: Owners, diff: string, step: number): Owners {
  const hunks = parseUnifiedDiff(diff);
  if (hunks.length === 0) return owners;

  const next: Owners = [];
  let oldPos = 1; // 1-based cursor into the pre-edit file

  for (const hunk of [...hunks].sort((a, b) => a.oldStart - b.oldStart)) {
    // A pure-insertion hunk (-X,0) inserts AFTER old line X; a normal hunk
    // starts AT old line oldStart.
    const copyThrough = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart - 1;
    while (oldPos <= copyThrough) {
      next.push(owners[oldPos - 1] ?? PRE_EXISTING);
      oldPos++;
    }
    for (const line of hunk.lines) {
      const marker = line[0];
      if (marker === " ") {
        next.push(owners[oldPos - 1] ?? PRE_EXISTING);
        oldPos++;
      } else if (marker === "-") {
        oldPos++;
      } else if (marker === "+") {
        next.push(step);
      }
    }
  }

  for (let i = oldPos - 1; i < owners.length; i++) next.push(owners[i] ?? PRE_EXISTING);
  return next;
}

export type LineOrigin = { path: string; line_no: number; step: number };

/** Full line→step map for a trace, excluding pre-existing lines. */
export function buildLineOrigin(events: TraceEvent[]): LineOrigin[] {
  const byPath = new Map<string, Owners>();
  for (const event of events) {
    if (event.type !== "file_edit") continue;
    const current = byPath.get(event.data.path) ?? [];
    byPath.set(event.data.path, applyEdit(current, event.data.diff, event.step));
  }

  const out: LineOrigin[] = [];
  for (const [path, owners] of byPath) {
    owners.forEach((step, i) => {
      if (step !== PRE_EXISTING) out.push({ path, line_no: i + 1, step });
    });
  }
  return out;
}
