/** MIGRATION DRIFT — the comparison, as a pure function over two lists.
 *
 *  WHY THIS FILE EXISTS. Twice in two days a migration was generated, committed
 *  and deployed while the live database was never migrated. 0004 added
 *  admin_user.password_changed_at; every session guard reads that column, so the
 *  panel became a redirect loop. 0005 added church.courtesy_text;
 *  findChurchByPhoneNumberId selects it, the query threw, and the webhook's
 *  catch turned that into a 200 — every member of every church got silence, and
 *  nobody was told. Both were found by a human running a simulation.
 *
 *  The 680-test suite cannot see either. It runs on PGlite with every migration
 *  applied, so "the code expects schema the live database does not have" is a
 *  statement the suite is structurally unable to make. It can only be made by
 *  reading the real database, which is why the check lives here and the reading
 *  lives at the edges.
 *
 *  IDENTITY IS THE TIMESTAMP, NOT THE HASH. A migration is identified by the
 *  journal's `when` (milliseconds, fixed at generate time), matched against
 *  drizzle.__drizzle_migrations.created_at, which is the same number the
 *  migrator copied out of the journal when it applied the file. That is not a
 *  convenience: it is the exact key drizzle's own migrator uses to decide what
 *  to apply (drizzle-orm/neon-http/migrator.js), so this comparison and the
 *  thing that fixes it agree by construction. Matching on the file hash instead
 *  would catch one extra case — a .sql file edited after it was applied — at the
 *  cost of needing the file bodies, which the bundled owner console cannot read.
 *  See migrations-journal.ts for why that matters.
 */

/** A migration the CODE expects: one entry of drizzle/meta/_journal.json. */
export interface ExpectedMigration {
  /** The journal tag, which is also the .sql filename without its extension. */
  readonly tag: string;
  /** The journal `when`, in milliseconds since the epoch. */
  readonly when: number;
}

/** A migration the DATABASE has: one row of drizzle.__drizzle_migrations.
 *
 *  created_at is a Postgres `bigint`, which every driver here hands back as a
 *  STRING. The conversion to a number belongs at the read edge, not in this
 *  file — a string that slipped through would silently match nothing and report
 *  total drift on a perfectly healthy database. */
export interface AppliedMigration {
  readonly createdAt: number;
}

/** in_sync   — the database has exactly what the code expects.
 *  behind    — the code expects migrations the database does not have. THE INCIDENT.
 *  ahead     — the database has migrations this code does not know about.
 *  diverged  — both at once. */
export type DriftStatus = 'in_sync' | 'behind' | 'ahead' | 'diverged';

export interface MigrationDrift {
  readonly status: DriftStatus;
  /** Expected but not applied, in journal order. Non-empty means the running
   *  code can reference columns and tables that are not there. */
  readonly missing: readonly ExpectedMigration[];
  /** Applied but not in the journal, oldest first. */
  readonly extra: readonly AppliedMigration[];
  readonly expectedCount: number;
  readonly appliedCount: number;
  /** Nothing has ever been applied: an empty migrations table, or one that does
   *  not exist yet. Worth its own flag because "5 of 5 missing" and "1 of 5
   *  missing" want very different sentences — the first is a database that was
   *  never set up, not one that fell behind. */
  readonly neverMigrated: boolean;
  /** Missing migrations that `drizzle-kit migrate` WILL NOT APPLY, a subset of
   *  `missing`.
   *
   *  The migrator takes the single highest created_at in the table and then
   *  applies only journal entries stamped later than it. A missing migration
   *  older than that high-water mark is skipped in silence — no error, no
   *  output, exit 0. So whenever this list is non-empty, telling an operator to
   *  "run npm run db:migrate" is a lie, and printing a fix that does not fix
   *  anything is how a detector becomes another way to be quietly wrong. */
  readonly skippedByMigrate: readonly ExpectedMigration[];
}

/** PURE. No I/O, no clock, no environment.
 *
 *  `expected` is the journal in its own order; `applied` may arrive in any
 *  order. */
export function compareMigrations(
  expected: readonly ExpectedMigration[],
  applied: readonly AppliedMigration[],
): MigrationDrift {
  const appliedAt = new Set(applied.map((a) => a.createdAt));
  const expectedAt = new Set(expected.map((e) => e.when));

  const missing = expected.filter((e) => !appliedAt.has(e.when));
  const extra = [...applied]
    .filter((a) => !expectedAt.has(a.createdAt))
    .sort((a, b) => a.createdAt - b.createdAt);

  // The migrator's cutoff: max(created_at) over everything already applied.
  // Non-finite stamps are excluded rather than allowed to poison the maximum —
  // a NULL created_at (a row written by something that is not drizzle's
  // migrator) arrives here as NaN, and one NaN in a plain reduce would swallow
  // the real high-water mark and turn a true "db:migrate cannot fix this" into a
  // reassuring empty list.
  const stamps = applied.map((a) => a.createdAt).filter((n) => Number.isFinite(n));
  const highWater = stamps.length ? Math.max(...stamps) : null;
  const skippedByMigrate = highWater === null ? [] : missing.filter((m) => m.when <= highWater);

  const status: DriftStatus =
    missing.length === 0 && extra.length === 0
      ? 'in_sync'
      : missing.length > 0 && extra.length > 0
        ? 'diverged'
        : missing.length > 0
          ? 'behind'
          : 'ahead';

  return {
    status,
    missing,
    extra,
    expectedCount: expected.length,
    appliedCount: applied.length,
    neverMigrated: applied.length === 0,
    skippedByMigrate,
  };
}

/** PURE. Whether this drift should stop a deploy — the exit code of db:check.
 *
 *  `behind` and `diverged` block, because in both the running code can reference
 *  schema that is not there, which is precisely the two incidents.
 *
 *  `ahead` DOES NOT BLOCK, and that is a deliberate call rather than an
 *  omission. A database ahead of the code means the code was rolled back while
 *  the schema stayed put. Every migration in this project is additive, so the
 *  schema is a superset of what the old code selects and the old code runs
 *  fine — and a rollback is an emergency, so a gate that refuses to let the
 *  previous release deploy would be blocking the fix during the outage it is
 *  supposed to help with. It is still reported loudly, for two reasons: the
 *  deployed code is not the code that produced this schema, and any migration
 *  authored before the rollback point will now be skipped in silence by the
 *  migrator (see skippedByMigrate). Loud, but not fatal. */
export function blocksDeploy(drift: MigrationDrift): boolean {
  return drift.status === 'behind' || drift.status === 'diverged';
}
