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

Prefer \`--keyword\` over a bare \`repoctx get\` (which dumps everything).
Use keywords to fetch only the modules relevant to the current task.
This keeps context small and responses fast.

## Targeted lookups — use these instead of reading source files

\`\`\`bash
repoctx get --keyword dal,charge      # modules related to a topic
repoctx get --keyword payments        # modules in the payments domain
repoctx get --symbol removeCharge     # look up a specific function
repoctx get interfaces/http           # everything indexed under a path
\`\`\`

Keywords are OR-filtered: \`--keyword dal,charge\` returns anything tagged
with "dal" OR "charge". Each module and symbol has its own keyword list —
use them to navigate without reading files.

## Speed note

Every file you skip reading = one fewer tool call = faster response.
A \`repoctx get --keyword X\` is one call. Reading three source files is
three calls. Always check repoctx before reaching for Read.

## When to run \`repoctx save\` (public contract changed)

Run it when any of these change:
- Exported functions, classes, or constants
- Module.exports / ESM exports
- Route handlers or API surface
- DAL/service patterns (factory signatures, argument shapes)
- Business logic behavior (soft-delete vs hard-delete, idempotency, etc.)
- A file is moved, renamed, or becomes a new entrypoint
- A new convention or pattern is introduced

Always include \`--keywords\` matching the domain and layer so future
lookups via \`--keyword\` can find this module:

\`\`\`bash
repoctx save data-access/mongoose/dals/index.js \\
  "DAL hub. CRUD for orders, charges, addresses, coins." \\
  --symbols "removeCharge,createOrder,getCharge" \\
  --keywords "dal,mongoose,orders,charges,db" \\
  --delta "Added removeCharge (hard delete)"
\`\`\`

Use \`--footguns\` to warn future agents about tricky behavior:

\`\`\`bash
  --footguns "deleteCharge = soft delete. removeCharge = hard delete. Don't confuse them."
\`\`\`

## When NOT to run \`repoctx save\`

Skip it for:
- Literals, log messages, comments, or formatting
- Internal refactors with no change to the public interface
- Test-only changes

## Symbol Cards (fine-grained lookup)

For key functions worth tracking individually:

\`\`\`bash
repoctx save-symbol removeCharge "Hard delete a charge from MongoDB" \\
  --file data-access/mongoose/dals/index.js \\
  --kind function \\
  --signature "({ chargeSchema }) => async ({ id }) => Promise<DeleteResult>" \\
  --related "deleteCharge,updateCharge" \\
  --keywords "dal,charge,delete"
\`\`\`

Then look it up with: \`repoctx get --symbol removeCharge\`

## Meta entries (patterns, glossary, folder map)

For knowledge not tied to a single file, use \`--meta\`:

\`\`\`bash
repoctx save .meta/patterns "DAL pattern: ({ schema }) => async (args) => ..." \\
  --keywords "pattern,convention,dal" --meta

repoctx save .meta/glossary "charge = payment attempt. order = set of charges." \\
  --keywords "glossary,domain" --meta

repoctx save .meta/structure "application/use-cases = business logic..." \\
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
