export type DiffLine = { type: "same" | "add" | "del"; text: string };

// Minimal line-level diff via a longest-common-subsequence table. Dependency
// free and plenty fast for comparing prompt versions (a few hundred lines).
// Returns the merged sequence: unchanged lines, deletions (in `a` not `b`),
// and additions (in `b` not `a`).
export function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const n = aLines.length;
  const m = bLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: "same", text: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: aLines[i] });
      i++;
    } else {
      out.push({ type: "add", text: bLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: aLines[i++] });
  while (j < m) out.push({ type: "add", text: bLines[j++] });
  return out;
}

export function diffCounts(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === "add") added++;
    else if (l.type === "del") removed++;
  }
  return { added, removed };
}
