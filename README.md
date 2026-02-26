# repoctx

LLMs are probabilistic reasoners.
Repositories are deterministic systems.

Deterministic context should be extracted outside the LLM.

repoctx precomputes repository context — diffs, summaries, symbol cards —
so the assistant reasons instead of explores.

Fast. Local. Minimal.
No server. No DB. No embeddings. No magic.

## The problem

Every new session, your agent reads the same files again to understand the
codebase. In large repos this means dozens of tool calls before writing a
single line. The context is thrown away when the session closes.

## How it works

- You (or your agent) run `repoctx save <file> "<summary>"` after working on a file
- repoctx stores the summary, exported symbols, keywords, and a content hash in `.repoctx/`
- Next session: `repoctx get --keyword auth` returns all indexed modules tagged with that keyword — **0 file reads**
- If a file changed since the last save, repoctx flags it as stale

The index survives session resets. Context is never lost.

## Install

```bash
# From npm (recommended)
npm install -g repoctx

# From source
git clone https://github.com/Ezequiiel98/repoctx.git
cd repoctx
npm install
npm run build
npm install -g .
```

## Quick start

```bash
cd your-repo
repoctx init                        # creates .repoctx/, adds to .gitignore
repoctx onboarding >> CLAUDE.md     # tells Claude how to use repoctx
```

That's it. From now on Claude can save context as it works and retrieve it at the start of each session.

## Token savings

Measured on a real Node.js service (checkout API, 341 source files):

| Scenario | Chars read | Tokens (~) | File reads |
|---|---|---|---|
| Without repoctx | 3,731 | ~933 | 4 |
| repoctx (layer not indexed yet) | 3,396 | ~849 | 2 |
| repoctx (layer fully indexed) | **1,139** | **~285** | **0** |

Tokens estimated using ~4 chars per token heuristic.

First session costs the same — you're reading the files anyway to work on them.
From the second session onwards, you pay ~285 tokens instead of ~933 for the
same context. The savings compound across sessions and teammates.

## Commands

### `repoctx save <file> "<summary>" [options]`

Save context for a file. Run this when a file's public contract changes.

```bash
repoctx save src/users/dal.js "MongoDB DAL for users. CRUD operations." \
  --symbols "createUser,getUser,deleteUser" \
  --keywords "dal,users,mongodb" \
  --deps "userSchema,sessionSchema" \
  --footguns "deleteUser is soft-delete only" \
  --delta "Added deleteUser (soft delete)"
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
repoctx save-symbol deleteUser "Hard delete a user from MongoDB" \
  --file src/users/dal.js \
  --kind function \
  --signature "({ userSchema }) => async ({ id }) => Promise<DeleteResult>" \
  --related "softDeleteUser:soft-delete variant" \
  --keywords "dal,users,delete"
```

### `repoctx get [path] [--keyword k1,k2] [--symbol name]`

Print saved context. **Prefer `--keyword` over bare `repoctx get`** — it uses
a keyword index (O(1)) and returns only what's relevant.

```bash
repoctx get --keyword auth            # modules tagged with "auth"
repoctx get --keyword dal,users       # OR logic across keywords
repoctx get src/users/                # everything indexed under a path
repoctx get --symbol deleteUser       # look up a specific function
```

### `repoctx stale`

List all files whose content changed since the last `save`.

```bash
repoctx stale
# ⚠ src/users/dal.js  (file content changed)
#   → repoctx save src/users/dal.js "<summary>" --delta "what changed"
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
  "user = registered account. session = active login token." \
  --keywords "glossary,domain" --meta

# Folder ownership
repoctx save .meta/structure \
  "src/users = user domain. src/auth = authentication. src/api = route handlers." \
  --keywords "structure,folders" --meta
```

## Sharing context with your team

`.repoctx/` is added to `.gitignore` by default (`repoctx init`). Context is
local per developer.

If you want to share context across the team, remove `.repoctx` from
`.gitignore` and commit it. Anyone who clones the repo gets the full index
immediately — no re-indexing needed.

## Maintenance

Built for my workflow; support is best-effort. PRs welcome.

## License

MIT
