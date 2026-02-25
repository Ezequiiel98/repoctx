# repoctx

A CLI that stores structured context about your codebase so AI coding
assistants don't have to re-explore it every session.

Instead of reading source files from scratch, Claude (or any agent) runs
`repoctx get --keyword <topic>` and gets summaries, exports, patterns and
domain knowledge in one call — no file reads needed.

## The problem

Every new session, your agent reads the same files again to understand the
codebase. In large repos this means dozens of tool calls before writing a
single line. The context is thrown away when the session closes.

## How it works

- You (or your agent) run `repoctx save <file> "<summary>"` after working on a file
- repoctx stores the summary, exported symbols, keywords, and a content hash in `.repoctx/`
- Next session: `repoctx get --keyword payments` returns all indexed modules tagged with that keyword — **0 file reads**
- If a file changed since the last save, repoctx flags it as stale

The index survives session resets. Context is never lost.

## Install

```bash
npm install -g repoctx
```

## Quick start

```bash
cd your-repo
repoctx init                        # creates .repoctx/, adds to .gitignore

# Index a file after working on it
repoctx save src/payments/dal.js \
  "MongoDB DAL for payments. CRUD for orders and charges." \
  --symbols "createOrder,getCharge,updateCharge" \
  --keywords "dal,payments,mongodb" \
  --footguns "deleteCharge is soft-delete. removeCharge is hard delete."

# Next session: get context without reading files
repoctx get --keyword payments
repoctx get --symbol getCharge
repoctx stale                       # see what changed since last save
```

## Token savings

Measured on a real Node.js service (checkout API, 341 source files):

| Scenario | Chars read | Tokens (~) | File reads |
|---|---|---|---|
| Without repoctx | 3,731 | ~933 | 4 |
| repoctx (layer not indexed yet) | 3,396 | ~849 | 2 |
| repoctx (layer fully indexed) | **1,139** | **~285** | **0** |

First session costs the same — you're reading the files anyway to work on them.
From the second session onwards, you pay ~285 tokens instead of ~933 for the
same context. The savings compound across sessions and teammates.

## Commands

### `repoctx save <file> "<summary>" [options]`

Save context for a file. Run this when a file's public contract changes.

```bash
repoctx save src/dal.js "MongoDB DAL for orders and charges." \
  --symbols "createOrder,getOrder,deleteOrder" \
  --keywords "dal,orders,mongodb" \
  --deps "orderSchema,chargeSchema" \
  --footguns "deleteOrder is soft-delete only" \
  --delta "Added removeOrder (hard delete)"
```

| Option | Description |
|---|---|
| `--symbols` | Comma-separated exported functions/classes |
| `--keywords` | Tags for filtering with `get --keyword`. **Always include these.** |
| `--deps` | Dependencies this module relies on |
| `--footguns` | Things that break if touched wrong |
| `--delta` | What changed in this save |
| `--meta` | Virtual entry — no real file (for patterns, glossary, folder maps) |

### `repoctx save-symbol <name> "<purpose>" --file <path> [options]`

Save a Symbol Card for a specific function or class.

```bash
repoctx save-symbol removeCharge "Hard delete a charge from MongoDB" \
  --file src/dal.js \
  --kind function \
  --signature "({ chargeSchema }) => async ({ id }) => Promise<DeleteResult>" \
  --related "deleteCharge:soft-delete variant" \
  --keywords "dal,charge"
```

### `repoctx get [path] [--keyword k1,k2] [--symbol name]`

Print saved context. **Prefer `--keyword` over bare `repoctx get`** — it uses
a keyword index (O(1)) and returns only what's relevant.

```bash
repoctx get --keyword payments        # modules tagged with "payments"
repoctx get --keyword dal,orders      # OR logic across keywords
repoctx get src/payments/             # everything indexed under a path
repoctx get --symbol removeCharge     # look up a specific function
```

### `repoctx stale`

List all files whose content changed since the last `save`.

```bash
repoctx stale
# ⚠ src/dal.js  (file content changed)
#   → repoctx save src/dal.js "<summary>" --delta "what changed"
```

### `repoctx checkpoint` / `repoctx diff [--top N]`

Save the current git HEAD as a baseline, then show what changed since then —
formatted for Claude to understand without reading full diffs.

```bash
repoctx checkpoint
# ... work for a few days ...
repoctx diff --top 5
```

### `repoctx init`

Initialize repoctx in the current repo. Creates `.repoctx/` and adds it to
`.gitignore`.

### `repoctx onboarding`

Print agent instructions ready to paste into `CLAUDE.md` or `AGENTS.md`.

```bash
repoctx onboarding >> CLAUDE.md
```

## When to save

**Do save** when the public contract changed:
- Exported functions, classes, or constants
- Route handlers or API surface
- DAL/service patterns (factory signatures, argument shapes)
- Business logic behavior (soft-delete vs hard-delete, idempotency, etc.)
- A file is moved, renamed, or becomes a new entrypoint

**Don't save** for:
- Literals, logs, comments, or formatting changes
- Internal refactors with no public interface change
- Test-only changes

## Meta entries (patterns, glossary, folder map)

For knowledge not tied to a single file:

```bash
# Codebase conventions
repoctx save .meta/patterns \
  "DAL pattern: ({ schema }) => async (args) => ... Exports at bottom: fn: fn(models)." \
  --keywords "pattern,convention,dal" --meta

# Domain glossary
repoctx save .meta/glossary \
  "order = set of charges toward a total amount. charge = single payment attempt." \
  --keywords "glossary,domain" --meta

# Folder ownership
repoctx save .meta/structure \
  "application/use-cases = business logic. data-access/mongoose/dals = all DB ops." \
  --keywords "structure,folders" --meta
```

## Sharing context with your team

`.repoctx/` is added to `.gitignore` by default (`repoctx init`). Context is
local per developer.

If you want to share context across the team, remove `.repoctx` from
`.gitignore` and commit it. Anyone who clones the repo gets the full index
immediately — no re-indexing needed.

## License

MIT
