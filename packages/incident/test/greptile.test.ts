import { describe, it, expect } from "vitest";
import { normalizeFinding } from "../src/greptile.js";

describe("greptile finding normalization", () => {
  it("accepts the CLI's path/line/body shape", () => {
    expect(normalizeFinding({ path: "src/items.ts", line: 42, body: "user_id may be null" })).toEqual({
      path: "src/items.ts",
      line_range: [42, 42],
      comment: "user_id may be null",
    });
  });

  it("accepts a start/end line pair in either order", () => {
    expect(normalizeFinding({ file: "a.ts", start_line: 40, end_line: 44, message: "x" })?.line_range).toEqual([40, 44]);
    expect(normalizeFinding({ file: "a.ts", start_line: 44, end_line: 40, message: "x" })?.line_range).toEqual([40, 44]);
  });

  it("accepts an explicit line_range array", () => {
    expect(normalizeFinding({ filePath: "a.ts", line_range: [3, 9], comment: "x" })?.line_range).toEqual([3, 9]);
  });

  it("keeps the permalink when there is one", () => {
    expect(normalizeFinding({ path: "a.ts", line: 1, body: "x", html_url: "https://gh/c/1" })?.url).toBe("https://gh/c/1");
  });

  it("rejects entries with no location or no text", () => {
    expect(normalizeFinding({ path: "a.ts", body: "no line here" })).toBeNull();
    expect(normalizeFinding({ line: 5, body: "no path here" })).toBeNull();
  });
});
