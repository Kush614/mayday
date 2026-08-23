import { describe, it, expect } from "vitest";
import { parseFailure, parseFrames, fromGreptileFinding } from "../src/parse-failure.js";

const nodeStack = `TypeError: Cannot read properties of null (reading 'toString')
    at toDTO (/Users/x/app/src/items.ts:42:29)
    at Array.map (<anonymous>)
    at listItems (/Users/x/app/src/items.ts:61:26)
    at Layer.handle [as handle_request] (/Users/x/app/node_modules/express/lib/router/layer.js:95:5)`;

describe("failure parsing", () => {
  it("extracts app frames in order and drops node_modules", () => {
    const frames = parseFrames(nodeStack);
    expect(frames.map((f) => `${f.path}:${f.line}`)).toEqual([
      "/Users/x/app/src/items.ts:42",
      "/Users/x/app/src/items.ts:61",
    ]);
  });

  it("classifies a stack trace vs test output", () => {
    expect(parseFailure(nodeStack).kind).toBe("stack_trace");
    expect(parseFailure(`FAIL test/items.test.ts > lists items\n ❯ src/items.ts:42:29`).kind).toBe("test_output");
  });

  it("keeps the error message as the headline", () => {
    expect(parseFailure(nodeStack).message).toMatch(/Cannot read properties of null/);
  });

  it("expands a Greptile finding into one frame per line", () => {
    const artifact = fromGreptileFinding({
      path: "src/items.ts",
      line_range: [40, 43],
      comment: "user_id can be null for guest carts; this will throw.",
    });
    expect(artifact.kind).toBe("greptile");
    expect(artifact.frames).toHaveLength(4);
    expect(artifact.frames[0]).toMatchObject({ path: "src/items.ts", line: 40 });
  });

  it("auto-detects a Greptile finding passed as JSON", () => {
    const artifact = parseFailure(JSON.stringify({ path: "src/items.ts", line_range: [12, 12], comment: "nit" }));
    expect(artifact.kind).toBe("greptile");
  });
});
