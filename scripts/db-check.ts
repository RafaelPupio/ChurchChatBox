import 'dotenv/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { blocksDeploy, compareMigrations, type MigrationDrift } from '../src/lib/migration-drift';
import { EXPECTED_MIGRATIONS } from '../src/lib/migrations-journal';
import { readAppliedMigrations } from '../src/lib/repo/platform';

/** `npm run db:check` — does the live database have the schema this code expects?
 *
 *  Exits non-zero on drift so it can gate a deploy. That is the point: migration
 *  0004 and migration 0005 were both generated, committed and deployed while the
 *  database was never migrated, and nothing in the pipeline was capable of
 *  noticing. A build step that fails is capable of noticing.
 *
 *  Operator-facing, so English. It names the exact migrations and prints the
 *  command that fixes them — an error that only says "drift detected" makes the
 *  reader go and do this comparison by hand, at the worst possible moment. */

const DRIZZLE_DIR = join(process.cwd(), 'drizzle');

/** Migration tags whose .sql file is not on disk. The journal is what both this
 *  script and the bundled owner console read, so a tag with no file passes every
 *  in-process check and then makes `drizzle-kit migrate` throw at the moment
 *  someone is trying to fix an outage. Cheap to check here, where there is a
 *  real filesystem. */
function missingSqlFiles(): string[] {
  return EXPECTED_MIGRATIONS.map((m) => m.tag).filter(
    (tag) => !existsSync(join(DRIZZLE_DIR, `${tag}.sql`)),
  );
}

function reportBehind(drift: MigrationDrift): void {
  const label = drift.neverMigrated
    ? 'the database has NEVER been migrated'
    : `the database is BEHIND the code by ${drift.missing.length} migration(s)`;
  console.error(`DRIFT — ${label}.`);
  console.error('');
  console.error('Missing (in the order they must be applied):');
  for (const m of drift.missing) console.error(`  ${m.tag}`);
  console.error('');
  console.error('What this costs if it ships: the code selects columns and tables these');
  console.error('migrations create, so those queries throw. The WhatsApp webhook catches the');
  console.error('error and returns 200 regardless — Meta is satisfied, never retries, and every');
  console.error('member of every church gets silence with nobody told. That has happened twice.');
}

function reportAhead(drift: MigrationDrift): void {
  console.error(
    `WARNING — the database is AHEAD of the code by ${drift.extra.length} migration(s).`,
  );
  console.error('');
  console.error('Applied stamps this code has no journal entry for:');
  for (const a of drift.extra) console.error(`  created_at=${a.createdAt}`);
  console.error('');
  console.error('Usually a rolled-back deploy: the code went back, the schema stayed. Not fatal');
  console.error('and NOT blocking — every migration here is additive, so the schema is a superset');
  console.error('of what this code selects and the app runs fine, and refusing to deploy would be');
  console.error('refusing to ship the rollback. Two things to know anyway: the running code is not');
  console.error('the code that produced this schema, and the migrator only applies journal entries');
  console.error('stamped later than the newest row in the table — so any migration you generate');
  console.error('from an older branch will be skipped without a word.');
}

function reportFix(drift: MigrationDrift): void {
  const fixable = drift.missing.length - drift.skippedByMigrate.length;
  console.error('');

  if (drift.skippedByMigrate.length) {
    console.error('db:migrate WILL NOT APPLY:');
    for (const m of drift.skippedByMigrate) console.error(`  ${m.tag}`);
    console.error('');
    console.error('It applies only journal entries stamped later than the newest created_at already');
    console.error('in the table, and these are older than it. It will print nothing, apply nothing,');
    console.error('and exit 0. Run their SQL by hand and insert the matching row, or regenerate them');
    console.error('so they carry a current timestamp.');
  }

  // The generic fix line is printed only when it is TRUE for something. A gate
  // that ends every failure with "run db:migrate" trains the reader to run it,
  // see success, and believe the problem is gone — which is the same shape of
  // quiet wrongness this whole check exists to end.
  if (fixable > 0) {
    if (drift.skippedByMigrate.length) console.error('');
    console.error(drift.skippedByMigrate.length ? `Fix (for the other ${fixable}):` : 'Fix:');
    console.error('  npm run db:migrate');
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // Explicitly fatal. A deploy gate that passes because it could not find the
    // database is a gate that always passes on the day it is misconfigured.
    console.error('DATABASE_URL is not set, so nothing was checked. Refusing to report success.');
    process.exitCode = 1;
    return;
  }

  const orphans = missingSqlFiles();
  if (orphans.length) {
    console.error('BROKEN MIGRATION FOLDER — the journal names files that are not on disk:');
    for (const tag of orphans) console.error(`  drizzle/${tag}.sql`);
    console.error('');
    console.error('drizzle-kit migrate cannot run at all in this state.');
    process.exitCode = 1;
    return;
  }

  const applied = await readAppliedMigrations();
  const drift = compareMigrations(EXPECTED_MIGRATIONS, applied);

  console.log(`journal   drizzle/meta/_journal.json — ${drift.expectedCount} migration(s) expected`);
  console.log(`database  drizzle.__drizzle_migrations — ${drift.appliedCount} migration(s) applied`);
  console.log('');

  if (drift.status === 'in_sync') {
    console.log('OK — the database has every migration this code expects.');
    return;
  }

  if (drift.status === 'ahead') {
    reportAhead(drift);
    // Deliberately exit 0. See blocksDeploy() in src/lib/migration-drift.ts.
    return;
  }

  if (drift.status === 'diverged') {
    console.error('DRIFT — the database and the code have DIVERGED.');
    console.error('');
    console.error('Missing (in the order they must be applied):');
    for (const m of drift.missing) console.error(`  ${m.tag}`);
    console.error('');
    console.error('Applied stamps this code has no journal entry for:');
    for (const a of drift.extra) console.error(`  created_at=${a.createdAt}`);
    console.error('');
    console.error('This is not a deploy that is merely late — the two sides have separate');
    console.error('histories. Find out which build produced what is in the database before');
    console.error('applying anything on top of it.');
  } else {
    reportBehind(drift);
  }

  reportFix(drift);
  if (blocksDeploy(drift)) process.exitCode = 1;
}

main().catch((error) => {
  // A check that cannot run is not a check that passed.
  console.error('Could not check migrations:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
