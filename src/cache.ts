import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

// ── Module Cards ─────────────────────────────────────────────────────────────

export type ExportEntry = {
  name: string;
  kind: "function" | "class" | "constant" | "type" | "other";
};

export type RepoctxFileCache = {
  path: string;
  hash: string;                        // SHA1 of file content
  publicSurfaceHash?: string | undefined; // SHA1 of joined symbol names — fast contract change detection
  summary: string;
  symbols: string[];                   // simple list for display
  exports?: ExportEntry[] | undefined; // typed exports surface
  keywords?: string[] | undefined;
  dependencies?: string[] | undefined;
  footguns?: string | undefined;
  delta?: string | undefined;
  repoHeadAtSave?: string | undefined;
  updatedAt: string;
};

export type RepoctxIndex = {
  version: 1;
  metaVersion?: number | undefined;
  files: Record<string, { hash: string; ref: string }>; // path → { hash, ref }
  keywordIndex: Record<string, string[]>;               // keyword → [paths]
};

// ── Symbol Cards ─────────────────────────────────────────────────────────────

export type SymbolRelation = {
  symbol: string;
  relation: string; // e.g. "soft-delete variant", "same model"
};

export type SymbolCard = {
  symbol: string;
  kind: "function" | "class" | "constant" | "type" | "other";
  file: string;
  signature?: string | undefined;
  purpose: string;
  related?: SymbolRelation[] | undefined;
  keywords?: string[] | undefined;
  updatedAt: string;
};

export type SymbolsIndex = {
  version: 1;
  symbols: Record<string, string>; // symbolName → filename in symbols dir
};

// ── Paths ─────────────────────────────────────────────────────────────────────

function repoRoot() {
  return process.cwd();
}

export function repoctxDir() {
  return path.join(repoRoot(), ".repoctx");
}

function filesDir() {
  return path.join(repoctxDir(), "files");
}

function symbolsDir() {
  return path.join(repoctxDir(), "symbols");
}

function indexFile() {
  return path.join(repoctxDir(), "index.json");
}

function symbolsIndexFile() {
  return path.join(repoctxDir(), "symbols-index.json");
}

export async function ensureDirs() {
  await fs.mkdir(filesDir(), { recursive: true });
  await fs.mkdir(symbolsDir(), { recursive: true });
}

// ── Hashing ───────────────────────────────────────────────────────────────────

export async function fileHash(file: string) {
  const buf = await fs.readFile(file);
  return crypto.createHash("sha1").update(buf).digest("hex");
}

/** Stable short filename derived from the path (not content) */
function refFromPath(p: string): string {
  return crypto.createHash("sha1").update(p).digest("hex").slice(0, 12) + ".json";
}

export function computePublicSurfaceHash(symbols: string[]): string {
  return crypto.createHash("sha1").update(symbols.slice().sort().join(",")).digest("hex").slice(0, 12);
}

// ── Module Card I/O ───────────────────────────────────────────────────────────

export async function loadIndex(): Promise<RepoctxIndex> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(indexFile(), "utf8");
    const parsed = JSON.parse(raw);
    // back-compat: old index had no keywordIndex
    if (!parsed.keywordIndex) parsed.keywordIndex = {};
    return parsed;
  } catch {
    return { version: 1, files: {}, keywordIndex: {} };
  }
}

export async function saveIndex(idx: RepoctxIndex) {
  await fs.writeFile(indexFile(), JSON.stringify(idx, null, 2), "utf8");
}

export async function loadFileCache(
  relativePath: string
): Promise<RepoctxFileCache | null> {
  const idx = await loadIndex();
  const entry = idx.files[relativePath];
  if (!entry) return null;
  try {
    const raw = await fs.readFile(path.join(filesDir(), entry.ref), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveFileCache(
  relativePath: string,
  data: RepoctxFileCache
) {
  const idx = await loadIndex();
  const ref = refFromPath(relativePath);

  await fs.writeFile(
    path.join(filesDir(), ref),
    JSON.stringify(data, null, 2),
    "utf8"
  );

  // Update file entry
  idx.files[relativePath] = { hash: data.hash, ref };

  // Rebuild keyword index for this path
  const keywords = data.keywords ?? [];
  // Remove this path from all existing keyword entries first
  for (const kw of Object.keys(idx.keywordIndex)) {
    idx.keywordIndex[kw] = (idx.keywordIndex[kw] ?? []).filter((p) => p !== relativePath);
    if ((idx.keywordIndex[kw] ?? []).length === 0) delete idx.keywordIndex[kw];
  }
  // Add to new keywords
  for (const kw of keywords) {
    if (!idx.keywordIndex[kw]) idx.keywordIndex[kw] = [];
    if (!idx.keywordIndex[kw]!.includes(relativePath)) {
      idx.keywordIndex[kw]!.push(relativePath);
    }
  }

  await saveIndex(idx);
}

/** O(1) keyword lookup using the index */
export async function lookupByKeywords(keywords: string[]): Promise<string[]> {
  const idx = await loadIndex();
  const sets = keywords.map((k) => new Set(idx.keywordIndex[k] ?? []));
  // OR logic: union of all sets
  const union = new Set<string>();
  for (const s of sets) for (const p of s) union.add(p);
  return [...union];
}

// ── Symbol Card I/O ───────────────────────────────────────────────────────────

export async function loadSymbolsIndex(): Promise<SymbolsIndex> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(symbolsIndexFile(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: 1, symbols: {} };
  }
}

export async function saveSymbolCard(data: SymbolCard) {
  const idx = await loadSymbolsIndex();
  const fname = refFromPath("symbol:" + data.symbol);
  await fs.writeFile(
    path.join(symbolsDir(), fname),
    JSON.stringify(data, null, 2),
    "utf8"
  );
  idx.symbols[data.symbol] = fname;
  await fs.writeFile(symbolsIndexFile(), JSON.stringify(idx, null, 2), "utf8");
}

export async function loadAllSymbols(): Promise<SymbolCard[]> {
  const idx = await loadSymbolsIndex();
  const results: SymbolCard[] = [];
  for (const fname of Object.values(idx.symbols)) {
    try {
      const raw = await fs.readFile(path.join(symbolsDir(), fname), "utf8");
      results.push(JSON.parse(raw));
    } catch {
      // skip corrupt entries
    }
  }
  return results;
}

// ── Git helpers ───────────────────────────────────────────────────────────────

export function getGitHead(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function getGitBranch(): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
