import { describe, expect, it } from "vitest";
import { diffCounts, diffLines } from "@/lib/voiceDemo/diff";

describe("diffLines", () => {
  it("marks identical text as entirely unchanged", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("detects a pure addition", () => {
    const lines = diffLines("a\nb", "a\nb\nc");
    expect(lines).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
      { type: "add", text: "c" },
    ]);
  });

  it("detects a pure deletion", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(lines).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("detects a single-line replacement as del+add, not a same", () => {
    const lines = diffLines("linje B", "linje B ENDRET");
    expect(lines).toEqual([
      { type: "del", text: "linje B" },
      { type: "add", text: "linje B ENDRET" },
    ]);
  });

  it("handles the prompt-editor scenario: mixed add/remove across a document", () => {
    // Mirrors the exact case exercised manually while building the prompt
    // diff panel: "linje A / linje B / linje C" -> "linje A / linje B ENDRET / linje D".
    const lines = diffLines("linje A\nlinje B\nlinje C", "linje A\nlinje B ENDRET\nlinje D");
    const counts = diffCounts(lines);
    expect(counts).toEqual({ added: 2, removed: 2 });
    expect(lines[0]).toEqual({ type: "same", text: "linje A" });
  });

  it("treats two empty strings as one matching blank line", () => {
    // "".split("\n") === [""] (one element, not zero), so this is a same,
    // not a no-op — verified against the actual algorithm, not assumed.
    expect(diffLines("", "")).toEqual([{ type: "same", text: "" }]);
  });

  it("diffs empty-against-non-empty with a spurious leading blank-line del (known quirk)", () => {
    // Because "" splits to [""], comparing empty text against real content
    // reports a del of an empty line before the real additions. Harmless in
    // the UI (an empty red line), but worth pinning so a future change to
    // the algorithm doesn't silently alter this instead of fixing it
    // on purpose.
    const lines = diffLines("", "a\nb");
    expect(lines).toEqual([
      { type: "del", text: "" },
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
  });
});

describe("diffCounts", () => {
  it("counts only add/del, ignoring same lines", () => {
    const counts = diffCounts([
      { type: "same", text: "x" },
      { type: "add", text: "y" },
      { type: "add", text: "z" },
      { type: "del", text: "w" },
    ]);
    expect(counts).toEqual({ added: 2, removed: 1 });
  });

  it("returns zero/zero for no changes", () => {
    expect(diffCounts([{ type: "same", text: "x" }])).toEqual({ added: 0, removed: 0 });
  });
});
