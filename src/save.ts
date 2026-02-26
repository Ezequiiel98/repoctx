import path from "node:path";
import { execSync } from "node:child_process";
import {
  fileHash,
  saveFileCache,
  getGitHead,
  computePublicSurfaceHash,
  type ExportEntry,
} from "./cache.js";

function findWhereUsed(relPath: string): string[] {
  try {
    const basename = path.basename(relPath, path.extname(relPath));
    const raw = execSync(
      `grep -r --include="*.js" --include="*.ts" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.repoctx -l "${basename}" . 2>/dev/null || true`,
      { encoding: "utf8", cwd: process.cwd() }
    );
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("node_modules") && !f.includes(".repoctx"))
      .filter((f) => f !== `./${relPath}` && f !== relPath)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function saveManual({
  filePath,
  summary,
  symbols,
  exports: exportsArg,
  keywords,
  dependencies,
  footguns,
  delta,
  meta = false,
}: {
  filePath: string;
  summary: string;
  symbols: string[];
  exports?: ExportEntry[];
  keywords: string[];
  dependencies?: string[];
  footguns?: string;
  delta?: string;
  meta?: boolean;
}) {
  const rel = meta
    ? filePath.replaceAll("\\", "/")
    : path.relative(process.cwd(), path.resolve(filePath)).replaceAll("\\", "/");

  const hash = meta ? "meta" : await fileHash(path.resolve(filePath));
  const publicSurfaceHash = symbols.length > 0 ? computePublicSurfaceHash(symbols) : undefined;
  const head = getGitHead();
  const whereUsed = meta ? [] : findWhereUsed(rel);

  const entry: Parameters<typeof saveFileCache>[1] = {
    path: rel,
    hash,
    summary: whereUsed.length > 0
      ? `${summary}\nUsed in: ${whereUsed.join(", ")}`
      : summary,
    symbols,
    keywords,
    updatedAt: new Date().toISOString(),
  };

  if (publicSurfaceHash) entry.publicSurfaceHash = publicSurfaceHash;
  if (exportsArg && exportsArg.length > 0) entry.exports = exportsArg;
  if (dependencies && dependencies.length > 0) entry.dependencies = dependencies;
  if (footguns) entry.footguns = footguns;
  if (delta) entry.delta = delta;
  if (head) entry.repoHeadAtSave = head;

  await saveFileCache(rel, entry);

  return rel;
}
