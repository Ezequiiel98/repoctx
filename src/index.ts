#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { saveManual } from "./save.js";
import { saveSymbol, parseRelated } from "./saveSymbol.js";
import { getContext, getStale } from "./get.js";
import { saveCheckpoint } from "./checkpoint.js";
import { runDiff } from "./diff.js";
import { getOnboardingText } from "./onboarding.js";
import { repoctxDir } from "./cache.js";

const program = new Command();

program
  .name("repoctx")
  .description("Structured context layer for AI coding assistants")
  .version("0.1.0");

// ── repoctx save ──────────────────────────────────────────────────────────────
program
  .command("save")
  .description("Save context for a file. Always include --keywords so future agents can find this module with repoctx get --keyword <topic>")
  .argument("<file>", "File path (or virtual key with --meta)")
  .argument("<summary>", "What this file does, its role, and conventions")
  .option("--symbols <symbols>", "Comma-separated exported symbols/functions", "")
  .option("--keywords <keywords>", "REQUIRED in practice: comma-separated tags (e.g. dal,payments,http). Used by repoctx get --keyword", "")
  .option("--deps <deps>", "Comma-separated dependencies of this module", "")
  .option("--footguns <text>", "Gotchas: things that break if touched wrong (e.g. soft-delete vs hard-delete)")
  .option("--delta <text>", "What changed in this save — short description of the diff")
  .option("--meta", "Virtual entry — no real file, skips hash check. Use for patterns, glossary, folder maps")
  .action(async (file: string, summary: string, opts) => {
    const split = (s: string) => s ? s.split(",").map((x: string) => x.trim()).filter(Boolean) : [];

    const rel = await saveManual({
      filePath: file,
      summary,
      symbols: split(opts.symbols),
      keywords: split(opts.keywords),
      dependencies: split(opts.deps),
      footguns: opts.footguns,
      delta: opts.delta,
      meta: !!opts.meta,
    });
    console.log(`✓ Saved context for ${rel}`);
  });

// ── repoctx save-symbol ───────────────────────────────────────────────────────
program
  .command("save-symbol")
  .description("Save a Symbol Card for a specific function, class, or constant. Enables repoctx get --symbol <name> lookup")
  .argument("<symbol>", "Symbol name (e.g. removeCharge)")
  .argument("<purpose>", "One-line description of what this symbol does")
  .requiredOption("--file <file>", "File where the symbol lives")
  .option("--kind <kind>", "function | class | constant | type | other", "function")
  .option("--signature <sig>", "Full signature (e.g. '({ chargeSchema }) => async ({ id }) => Promise<Result>')")
  .option("--related <pairs>", "Typed relations: 'symbol:relation,symbol:relation' (e.g. 'deleteCharge:soft-delete variant')", "")
  .option("--keywords <keywords>", "Same tags as the parent module so --keyword lookups include this symbol too", "")
  .action(async (symbol: string, purpose: string, opts) => {
    const split = (s: string) => s ? s.split(",").map((x: string) => x.trim()).filter(Boolean) : [];

    await saveSymbol({
      symbol,
      purpose,
      file: opts.file,
      kind: opts.kind,
      signature: opts.signature,
      related: opts.related ? parseRelated(opts.related) : [],
      keywords: split(opts.keywords),
    });
    console.log(`✓ Saved symbol card for ${symbol}`);
  });

// ── repoctx get ───────────────────────────────────────────────────────────────
program
  .command("get")
  .description("Print saved context. Prefer --keyword over bare get — it's faster, cheaper, and less noisy")
  .argument("[path]", "Filter by file or directory path")
  .option("--keyword <keywords>", "Filter by keyword(s), comma-separated OR logic. e.g. --keyword dal,payments. Use this before reaching for Read on a source file")
  .option("--symbol <name>", "Look up a specific symbol card by name")
  .action(async (filterPath: string | undefined, opts) => {
    const keywords = opts.keyword
      ? opts.keyword.split(",").map((s: string) => s.trim()).filter(Boolean)
      : undefined;

    const output = await getContext({
      ...(filterPath !== undefined && { filterPath }),
      ...(keywords !== undefined && { keywords }),
      ...(opts.symbol !== undefined && { symbol: opts.symbol }),
    });

    if (!output.trim()) {
      console.log("No context found. Use `repoctx save` to add context.");
      return;
    }

    process.stdout.write(output + "\n");
  });

// ── repoctx stale ─────────────────────────────────────────────────────────────
program
  .command("stale")
  .description("List all indexed files whose content changed since last save")
  .action(async () => {
    const results = await getStale();
    if (results.length === 0) {
      console.log("✓ All context is up to date.");
      return;
    }
    console.log(`${results.length} stale file(s):\n`);
    for (const { path: p, reason } of results) {
      console.log(`  ⚠ ${p}  (${reason})`);
      console.log(`    → repoctx save ${p} "<updated summary>" --keywords "..." --delta "what changed"`);
    }
  });

// ── repoctx checkpoint ────────────────────────────────────────────────────────
program
  .command("checkpoint")
  .description("Save current git HEAD as baseline for future diffs")
  .action(async () => {
    try {
      const cp = await saveCheckpoint();
      console.log(`✓ Checkpoint saved: ${cp.branch} @ ${cp.head.slice(0, 7)} (${cp.at})`);
    } catch (e: any) {
      console.error(`Error: ${e?.message ?? e}`);
      console.error("Make sure you are inside a git repository.");
      process.exit(1);
    }
  });

// ── repoctx diff ──────────────────────────────────────────────────────────────
program
  .command("diff")
  .description("Show changes since last checkpoint, formatted for Claude")
  .option("--top <n>", "Show only top N changed files by lines modified")
  .action(async (opts) => {
    const top = opts.top ? Number(opts.top) : undefined;
    const output = await runDiff(top !== undefined ? { top } : {});
    process.stdout.write(output + "\n");
  });

// ── repoctx init ──────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Initialize repoctx in the current repo: creates .repoctx/ and adds it to .gitignore")
  .action(async () => {
    await fs.mkdir(repoctxDir(), { recursive: true });

    // Add .repoctx to .gitignore if not already there
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    let alreadyIgnored = false;
    try {
      const content = await fs.readFile(gitignorePath, "utf8");
      alreadyIgnored = content.split("\n").some((l) => l.trim() === ".repoctx");
    } catch {
      // no .gitignore yet, will create
    }

    if (!alreadyIgnored) {
      await fs.appendFile(gitignorePath, "\n# repoctx context index\n.repoctx\n");
      console.log("✓ Added .repoctx to .gitignore");
    } else {
      console.log("✓ .repoctx already in .gitignore");
    }

    console.log("✓ repoctx initialized. Run `repoctx onboarding` to get CLAUDE.md instructions.");
  });

// ── repoctx onboarding ────────────────────────────────────────────────────────
program
  .command("onboarding")
  .description("Print instructions for AI agents (paste into CLAUDE.md)")
  .action(() => {
    process.stdout.write(getOnboardingText() + "\n");
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
