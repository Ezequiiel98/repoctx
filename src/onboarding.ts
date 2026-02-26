export function getOnboardingText(): string {
  return `
# repoctx — Agent Instructions

repoctx is a persistent context layer for this repo. It stores module
summaries, symbol cards, patterns, and domain knowledge in .repoctx/.

The index survives session resets — you never lose context when a
conversation closes and reopens. Always read from repoctx first; it
prevents hallucinations by grounding your understanding in committed,
structured facts instead of memory.

## Always start a session with

\`\`\`bash
repoctx get --keyword <topic>   # targeted: only what you need
repoctx diff --top 8            # what changed since the last checkpoint
\`\`\`

If both return empty, the index hasn't been populated yet — proceed normally
and run \`repoctx save\` after your first meaningful change.

Prefer \`--keyword\` over a bare \`repoctx get\` (which dumps everything).
Use keywords to fetch only the modules relevant to the current task.
This keeps context small and responses fast.

## Targeted lookups — use these instead of reading source files

\`\`\`bash
repoctx get --keyword dal,users       # modules related to a topic
repoctx get --keyword auth            # modules in the auth domain
repoctx get --symbol deleteUser       # look up a specific function
repoctx get src/users/                # everything indexed under a path
\`\`\`

Keywords are OR-filtered: \`--keyword dal,charge\` returns anything tagged
with "dal" OR "charge". Each module and symbol has its own keyword list —
use them to navigate without reading files.

## Speed note

Every file you skip reading = one fewer tool call = faster response.
A \`repoctx get --keyword X\` is one call. Reading three source files is
three calls. Always check repoctx before reaching for Read.

## After every Edit or Write

Before responding to the user, check:
- Did the public interface change? (exports, route handlers, DAL signatures, business logic behavior)
- If yes → run \`repoctx save\` for that file before continuing
- If no → skip

Always include \`--keywords\` so future lookups can find this module:

\`\`\`bash
repoctx save src/users/dal.js \\
  "MongoDB DAL for users. CRUD operations." \\
  --symbols "createUser,getUser,deleteUser" \\
  --keywords "dal,users,mongodb" \\
  --delta "Added deleteUser (soft delete)"
\`\`\`

Use \`--footguns\` to warn future agents about tricky behavior:

\`\`\`bash
  --footguns "deleteUser = soft delete. removeUser = hard delete. Don't confuse them."
\`\`\`

Skip \`repoctx save\` for: literals, logs, comments, formatting, internal refactors with no public interface change, test-only changes.

## Symbol Cards (fine-grained lookup)

For key functions worth tracking individually:

\`\`\`bash
repoctx save-symbol deleteUser "Hard delete a user from MongoDB" \\
  --file src/users/dal.js \\
  --kind function \\
  --signature "({ userSchema }) => async ({ id }) => Promise<DeleteResult>" \\
  --related "softDeleteUser:soft-delete variant" \\
  --keywords "dal,users,delete"
\`\`\`

Then look it up with: \`repoctx get --symbol deleteUser\`

## Meta entries (patterns, glossary, folder map)

For knowledge not tied to a single file, use \`--meta\`:

\`\`\`bash
repoctx save .meta/patterns "DAL pattern: ({ schema }) => async (args) => ..." \\
  --keywords "pattern,convention,dal" --meta

repoctx save .meta/glossary "user = registered account. session = active login token." \\
  --keywords "glossary,domain" --meta

repoctx save .meta/structure "src/users = user domain. src/auth = authentication. src/api = route handlers." \\
  --keywords "structure,folders" --meta
\`\`\`

## Freshness

If \`repoctx get\` shows \`⚠ Context outdated\` for a file, read it and
run \`repoctx save\` with an updated summary before working on it.
Refresh only the stale file — do not re-index the whole repo.

## Output discipline

- Always try \`repoctx get --keyword <topic>\` before reaching for Read.
- If repoctx can answer your question, stop there.
- If you must read a file, prefer a targeted slice (10–30 lines) to
  confirm exact syntax, not to understand the module from scratch.
- After a meaningful change, update repoctx for that module.
`.trim();
}
