import { execSync } from "node:child_process";
import { loadCheckpoint } from "./checkpoint.js";

type FileStat = {
  file: string;
  additions: number;
  deletions: number;
};

function parseNumstat(output: string): FileStat[] {
  const results: FileStat[] = [];
  for (const line of output.trim().split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    const file = parts[2];
    if (!file) continue;
    results.push({ file, additions: Number(parts[0]), deletions: Number(parts[1]) });
  }
  return results;
}

export async function runDiff({ top }: { top?: number } = {}) {
  const checkpoint = await loadCheckpoint();
  if (!checkpoint) {
    return "No checkpoint found. Run `repoctx checkpoint` first.";
  }

  const { head, at } = checkpoint;
  const shortHead = head.slice(0, 7);

  let currentHead: string;
  try {
    currentHead = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "Not in a git repository.";
  }

  if (currentHead === head) {
    return `No changes since checkpoint (${shortHead}).`;
  }

  let numstatOutput: string;
  try {
    numstatOutput = execSync(`git diff ${head}..HEAD --numstat`, { encoding: "utf8" });
  } catch {
    return `Could not compute diff from ${shortHead}.`;
  }

  let stats = parseNumstat(numstatOutput);
  stats.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));

  const topStats = top ? stats.slice(0, top) : stats;

  const lines: string[] = [];
  lines.push(`# Repoctx Diff (since ${shortHead} — ${at})`);
  lines.push("");
  lines.push(`Files changed (${stats.length}):`);
  lines.push("");

  for (const s of topStats) {
    lines.push(`- ${s.file} (+${s.additions} -${s.deletions})`);
  }

  if (top && stats.length > top) {
    lines.push(`... and ${stats.length - top} more files`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  for (const s of topStats) {
    try {
      const fileDiff = execSync(`git diff ${head}..HEAD -- "${s.file}"`, {
        encoding: "utf8",
      });

      if (!fileDiff.trim()) continue;

      lines.push(`[${s.file}]`);

      const diffLines = fileDiff
        .split("\n")
        .filter((l: string) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
        .slice(0, 40);

      lines.push(...diffLines);
      lines.push("");
    } catch {
      // skip if diff fails for a specific file
    }
  }

  return lines.join("\n");
}
