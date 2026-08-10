import journal from '../../drizzle/meta/_journal.json';
import type { ExpectedMigration } from './migration-drift';

/** THE CODE SIDE of the drift comparison: what this build of the app expects the
 *  database to have.
 *
 *  A STATIC IMPORT, not a filesystem read, and that is the whole point of the
 *  file. The owner console is a server component bundled by Next and deployed to
 *  Vercel, where only files Next traced into the bundle exist at runtime —
 *  `readFileSync(join(process.cwd(), 'drizzle', …))` is invisible to that
 *  tracing and would come back empty in production. An empty journal compares as
 *  "in sync" against any database at all, so the drift detector would report all
 *  clear from the one environment it was built for. A static import cannot fail
 *  that way: webpack resolves it at build time, `next build` fails loudly if the
 *  file moves, and the parsed contents ship inside the bundle.
 *
 *  It also means the deploy script and the console read the same bytes through
 *  the same code path, so they can never disagree about what is expected.
 *
 *  The .sql bodies deliberately do NOT come along. There is no ergonomic way to
 *  bundle a directory of .sql files whose contents change with every migration
 *  without a per-file import line that someone will forget to add — and the
 *  journal alone answers the question that matters. scripts/db-check.ts, which
 *  runs in Node with a real filesystem, checks that every tag here still has its
 *  .sql file on disk. */
export const EXPECTED_MIGRATIONS: readonly ExpectedMigration[] = journal.entries
  .map((entry) => ({ tag: entry.tag, when: entry.when }))
  // Journal order is already chronological, but the sort makes that a property
  // of this list rather than a hope about the file: every consumer prints
  // "missing" in the order the migrations must be applied.
  .sort((a, b) => a.when - b.when);
