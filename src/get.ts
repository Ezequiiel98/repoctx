import path from "node:path";
import {
  loadIndex,
  loadFileCache,
  fileHash,
  loadAllSymbols,
  lookupByKeywords,
} from "./cache.js";

export async function getContext({
  filterPath,
  keywords,
  symbol,
}: {
  filterPath?: string;
  keywords?: string[];
  symbol?: string;
} = {}) {
  const lines: string[] = [];

  // ── Symbol lookup ──────────────────────────────────────────────────────────
  if (symbol) {
    const allSymbols = await loadAllSymbols();
    const match = allSymbols.find(
      (s) => s.symbol.toLowerCase() === symbol.toLowerCase()
    );
    if (!match) return `No symbol found: "${symbol}"`;

    lines.push(`[symbol: ${match.symbol}]`);
    lines.push(`Kind: ${match.kind}`);
    lines.push(`File: ${match.file}`);
    lines.push(`Purpose: ${match.purpose}`);
    if (match.signature) lines.push(`Signature: ${match.signature}`);
    if (match.related?.length) {
      lines.push(`Related:`);
      for (const r of match.related) lines.push(`  - ${r.symbol} (${r.relation})`);
    }
    if (match.keywords?.length) lines.push(`Keywords: ${match.keywords.join(", ")}`);
    lines.push(`Updated: ${match.updatedAt}`);
    return lines.join("\n");
  }

  // ── Determine which paths to show ─────────────────────────────────────────
  let targetPaths: string[] | null = null; // null = show all

  if (keywords && keywords.length > 0) {
    // O(1) lookup via keyword index
    targetPaths = await lookupByKeywords(keywords);
  }

  // ── Module cards ───────────────────────────────────────────────────────────
  const idx = await loadIndex();

  const relFilter = filterPath
    ? path.relative(process.cwd(), path.resolve(filterPath)).replaceAll("\\", "/")
    : undefined;

  const pathsToShow = targetPaths ?? Object.keys(idx.files);

  for (const rel of pathsToShow) {
    if (relFilter) {
      const isCwd = relFilter === "" || relFilter === ".";
      const isExact = rel === relFilter;
      const isUnder = rel.startsWith(relFilter + "/");
      if (!isCwd && !isExact && !isUnder) continue;
    }

    const cache = await loadFileCache(rel);
    if (!cache) continue;

    lines.push(`[${rel}]`);
    lines.push(cache.summary);
    if (cache.symbols.length > 0) lines.push(`Symbols: ${cache.symbols.join(", ")}`);
    if (cache.exports?.length) {
      lines.push(`Exports: ${cache.exports.map((e) => `${e.name}(${e.kind})`).join(", ")}`);
    }
    if (cache.keywords?.length) lines.push(`Keywords: ${cache.keywords.join(", ")}`);
    if (cache.dependencies?.length) lines.push(`Deps: ${cache.dependencies.join(", ")}`);
    if (cache.footguns) lines.push(`⚠ Footguns: ${cache.footguns}`);
    if (cache.delta) lines.push(`Δ Last change: ${cache.delta}`);

    if (cache.hash !== "meta") {
      try {
        const currentHash = await fileHash(path.resolve(rel));
        if (currentHash !== cache.hash) {
          lines.push("⚠ Context outdated (file changed since last save)");
        }
      } catch {
        lines.push("⚠ File not found (may have been deleted or moved)");
      }
    }

    lines.push("");
  }

  // ── Symbol cards ───────────────────────────────────────────────────────────
  const allSymbols = await loadAllSymbols();

  let symbolsToShow = allSymbols;
  if (keywords && keywords.length > 0) {
    symbolsToShow = allSymbols.filter((s) =>
      keywords.some((k) => s.keywords?.includes(k))
    );
  }

  if (symbolsToShow.length > 0 && !symbol) {
    lines.push("── Symbols ──────────────────────────────────────────────");
    for (const s of symbolsToShow) {
      lines.push(`[symbol: ${s.symbol}] (${s.kind}) ${s.file}`);
      lines.push(`  ${s.purpose}`);
      if (s.signature) lines.push(`  Sig: ${s.signature}`);
      if (s.related?.length) {
        lines.push(`  Related: ${s.related.map((r) => `${r.symbol} (${r.relation})`).join(", ")}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ── Stale check ───────────────────────────────────────────────────────────────

export async function getStale(): Promise<{ path: string; reason: string }[]> {
  const idx = await loadIndex();
  const stale: { path: string; reason: string }[] = [];

  for (const rel of Object.keys(idx.files)) {
    const cache = await loadFileCache(rel);
    if (!cache || cache.hash === "meta") continue;

    try {
      const currentHash = await fileHash(path.resolve(rel));
      if (currentHash !== cache.hash) {
        stale.push({ path: rel, reason: "file content changed" });
      }
    } catch {
      stale.push({ path: rel, reason: "file not found" });
    }
  }

  return stale;
}
