import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/** Migration drift: the code expects schema the live database does not have.
 *
 *  This is the failure the other 680 tests cannot see. They run against a PGlite
 *  that has every migration in drizzle/ applied to it by the harness, so "the
 *  database is behind the code" is not a state they can be in. It shipped twice
 *  in two days — 0004's admin_user.password_changed_at made the panel a redirect
 *  loop, 0005's church.courtesy_text made findChurchByPhoneNumberId throw into
 *  the webhook's catch, which returned 200 and left every member in silence.
 *
 *  So the comparison is a pure function over two lists and is tested as one, and
 *  the two reads that feed it are tested at their own edges. */

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__migrationDriftClient = client;
  return { db: drizzle(client, { schema }) };
});

import {
  blocksDeploy,
  compareMigrations,
  type AppliedMigration,
  type ExpectedMigration,
} from '@/lib/migration-drift';
import { DRIFT_CHECK_UNAVAILABLE, driftMessage } from '@/lib/migration-drift-messages';
import { EXPECTED_MIGRATIONS } from '@/lib/migrations-journal';
import { readAppliedMigrations } from '@/lib/repo/platform';

/** Five migrations with the shape the real journal has: monotonically increasing
 *  millisecond stamps, far enough apart that no test accidentally relies on
 *  adjacency. */
const M: ExpectedMigration[] = [
  { tag: '0000_steep_hiroim', when: 1_784_141_586_735 },
  { tag: '0001_handy_peter_parker', when: 1_786_114_186_658 },
  { tag: '0002_public_hobgoblin', when: 1_786_120_615_296 },
  { tag: '0003_acoustic_omega_sentinel', when: 1_786_127_137_767 },
  { tag: '0004_romantic_redwing', when: 1_786_223_366_388 },
];

const appliedFor = (...migrations: ExpectedMigration[]): AppliedMigration[] =>
  migrations.map((m) => ({ createdAt: m.when }));

describe('compareMigrations — in sync', () => {
  it('reports in_sync when every expected migration is applied', () => {
    const drift = compareMigrations(M, appliedFor(...M));
    expect(drift.status).toBe('in_sync');
    expect(drift.missing).toEqual([]);
    expect(drift.extra).toEqual([]);
    expect(drift.expectedCount).toBe(5);
    expect(drift.appliedCount).toBe(5);
    expect(drift.neverMigrated).toBe(false);
    expect(blocksDeploy(drift)).toBe(false);
  });

  it('does not care what order the database rows arrive in', () => {
    // `order by created_at` is in the query, but nothing in the comparison may
    // depend on it — the set of stamps is the whole input.
    const shuffled = [M[3], M[0], M[4], M[2], M[1]];
    expect(compareMigrations(M, appliedFor(...shuffled)).status).toBe('in_sync');
  });

  it('is in sync for an empty journal against an empty database', () => {
    // Degenerate, but it must not report drift: a project with no migrations
    // yet is not a broken one.
    const drift = compareMigrations([], []);
    expect(drift.status).toBe('in_sync');
    expect(drift.neverMigrated).toBe(true);
    expect(blocksDeploy(drift)).toBe(false);
  });
});

describe('compareMigrations — one behind', () => {
  const drift = compareMigrations(M, appliedFor(M[0], M[1], M[2], M[3]));

  it('reports behind and names the one migration', () => {
    expect(drift.status).toBe('behind');
    expect(drift.missing.map((m) => m.tag)).toEqual(['0004_romantic_redwing']);
    expect(drift.extra).toEqual([]);
    expect(drift.neverMigrated).toBe(false);
  });

  it('blocks the deploy', () => {
    // The exact state of the 0004 incident: the panel became unreachable.
    expect(blocksDeploy(drift)).toBe(true);
  });

  it('says db:migrate will fix it, because it will', () => {
    expect(drift.skippedByMigrate).toEqual([]);
  });
});

describe('compareMigrations — several behind', () => {
  const drift = compareMigrations(M, appliedFor(M[0], M[1]));

  it('names every missing migration, in the order they must be applied', () => {
    expect(drift.status).toBe('behind');
    expect(drift.missing.map((m) => m.tag)).toEqual([
      '0002_public_hobgoblin',
      '0003_acoustic_omega_sentinel',
      '0004_romantic_redwing',
    ]);
    expect(blocksDeploy(drift)).toBe(true);
  });

  it('counts both sides so the operator can see the gap at a glance', () => {
    expect(drift.expectedCount).toBe(5);
    expect(drift.appliedCount).toBe(2);
  });

  it('reports a gap in the middle, not just a truncated tail', () => {
    // 0002 applied, 0001 skipped. A comparison written as "everything after the
    // highest applied stamp" would call this in sync and be wrong.
    const gap = compareMigrations(M, appliedFor(M[0], M[2], M[3], M[4]));
    expect(gap.status).toBe('behind');
    expect(gap.missing.map((m) => m.tag)).toEqual(['0001_handy_peter_parker']);
  });
});

describe('compareMigrations — empty database', () => {
  const drift = compareMigrations(M, []);

  it('reports every migration missing and flags that none was ever applied', () => {
    expect(drift.status).toBe('behind');
    expect(drift.missing).toHaveLength(5);
    expect(drift.appliedCount).toBe(0);
    expect(drift.neverMigrated).toBe(true);
    expect(blocksDeploy(drift)).toBe(true);
  });

  it('does not claim db:migrate is powerless, because on an empty database it is not', () => {
    // No high-water mark exists, so the migrator applies everything from 0000.
    expect(drift.skippedByMigrate).toEqual([]);
  });
});

describe('compareMigrations — database ahead of the code (a rollback)', () => {
  const rolledBack = M.slice(0, 3);
  const drift = compareMigrations(rolledBack, appliedFor(...M));

  it('reports ahead and names the stamps it cannot account for', () => {
    expect(drift.status).toBe('ahead');
    expect(drift.missing).toEqual([]);
    expect(drift.extra.map((a) => a.createdAt)).toEqual([M[3].when, M[4].when]);
  });

  it('DOES NOT block the deploy', () => {
    // The decision this test exists to pin down. A database ahead of the code
    // means the code was rolled back and the schema stayed; every migration here
    // is additive, so the schema is a superset of what the old code selects and
    // the old code runs. A rollback is also an emergency — a gate that refused
    // it would be blocking the fix during the outage. Reported loudly, not
    // fatally.
    expect(blocksDeploy(drift)).toBe(false);
  });

  it('sorts the unexplained rows oldest first', () => {
    const reversed = compareMigrations(rolledBack, appliedFor(M[4], M[3]));
    expect(reversed.extra.map((a) => a.createdAt)).toEqual([M[3].when, M[4].when]);
  });
});

describe('compareMigrations — diverged', () => {
  // Missing 0003 and 0004, and carrying a stamp from a branch this code has
  // never seen: two histories, not one that is merely late.
  const stranger: AppliedMigration = { createdAt: 1_786_300_000_000 };
  const drift = compareMigrations(M, [...appliedFor(M[0], M[1], M[2]), stranger]);

  it('reports diverged rather than picking one of behind or ahead', () => {
    expect(drift.status).toBe('diverged');
    expect(drift.missing.map((m) => m.tag)).toEqual([
      '0003_acoustic_omega_sentinel',
      '0004_romantic_redwing',
    ]);
    expect(drift.extra).toEqual([stranger]);
    expect(blocksDeploy(drift)).toBe(true);
  });
});

describe('compareMigrations — migrations db:migrate would silently skip', () => {
  /** drizzle-kit migrate takes max(created_at) from the table and applies only
   *  journal entries stamped later. Anything missing and older is skipped with
   *  no error and exit 0 — so telling the operator to run db:migrate would be a
   *  lie, and a detector that prints a fix which does not fix anything is just a
   *  new way to be quietly wrong. */
  it('flags a missing migration older than the newest applied one', () => {
    const drift = compareMigrations(M, appliedFor(M[0], M[1], M[3], M[4]));
    expect(drift.missing.map((m) => m.tag)).toEqual(['0002_public_hobgoblin']);
    expect(drift.skippedByMigrate.map((m) => m.tag)).toEqual(['0002_public_hobgoblin']);
  });

  it('splits a mixed case into the half db:migrate handles and the half it does not', () => {
    const drift = compareMigrations(M, appliedFor(M[0], M[2]));
    expect(drift.missing.map((m) => m.tag)).toEqual([
      '0001_handy_peter_parker',
      '0003_acoustic_omega_sentinel',
      '0004_romantic_redwing',
    ]);
    // 0001 predates the applied 0002 and will be skipped; the later two will not.
    expect(drift.skippedByMigrate.map((m) => m.tag)).toEqual(['0001_handy_peter_parker']);
  });

  it('is not fooled by a row with an unusable created_at', () => {
    // Number(null) is 0, Number('garbage') is NaN. Either would win a naive
    // reduce over the maximum and hide a genuinely unfixable migration.
    const drift = compareMigrations(M, [
      ...appliedFor(M[0], M[1], M[3], M[4]),
      { createdAt: Number.NaN },
    ]);
    expect(drift.skippedByMigrate.map((m) => m.tag)).toEqual(['0002_public_hobgoblin']);
  });
});

describe('compareMigrations — purity', () => {
  it('does not mutate or reorder its inputs', () => {
    const expected = [...M];
    const applied = appliedFor(M[4], M[0]);
    compareMigrations(expected, applied);
    expect(expected).toEqual(M);
    expect(applied.map((a) => a.createdAt)).toEqual([M[4].when, M[0].when]);
  });
});

describe('EXPECTED_MIGRATIONS', () => {
  /** The code side of the comparison. It is a static import of the journal, not
   *  a filesystem read, because the owner console is bundled by Next and
   *  deployed to Vercel where an untraced readFileSync returns nothing — and an
   *  empty journal compares as "in sync" against every database on earth. */
  const journal = JSON.parse(
    readFileSync(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string; when: number }> };

  it('carries every journal entry', () => {
    expect(EXPECTED_MIGRATIONS).toHaveLength(journal.entries.length);
    expect(EXPECTED_MIGRATIONS.length).toBeGreaterThan(5);
  });

  it('matches the journal tag for tag and stamp for stamp', () => {
    expect(EXPECTED_MIGRATIONS.map((m) => m.tag)).toEqual(journal.entries.map((e) => e.tag));
    expect(EXPECTED_MIGRATIONS.map((m) => m.when)).toEqual(journal.entries.map((e) => e.when));
  });

  it('is ordered oldest first, so "missing" always prints in apply order', () => {
    const stamps = EXPECTED_MIGRATIONS.map((m) => m.when);
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
  });

  it('has a distinct stamp per migration — the stamp is the identity key', () => {
    expect(new Set(EXPECTED_MIGRATIONS.map((m) => m.when)).size).toBe(EXPECTED_MIGRATIONS.length);
  });
});

describe('driftMessage — what /owner actually says', () => {
  it('says the database is in order when it is, instead of rendering nothing', () => {
    // A check that is silent when healthy is indistinguishable from a check that
    // stopped running, and "it looked fine" is how both incidents shipped.
    const message = driftMessage(compareMigrations(M, appliedFor(...M)));
    expect(message.tone).toBe('ok');
    expect(message.title).toBe('Banco de dados em dia');
    expect(message.fix).toBeNull();
  });

  it('raises the alarm and names the missing migrations when behind', () => {
    const message = driftMessage(compareMigrations(M, appliedFor(M[0], M[1], M[2], M[3])));
    expect(message.tone).toBe('alarm');
    expect(message.title).toBe('BANCO DE DADOS DESATUALIZADO');
    expect(message.items).toEqual(['0004_romantic_redwing']);
    expect(message.fix).toBe('npm run db:migrate');
  });

  it('names the silence, because that is the part that is invisible', () => {
    const message = driftMessage(compareMigrations(M, appliedFor(M[0])));
    expect(message.body).toContain('200');
    expect(message.body).toContain('sem resposta');
  });

  it('distinguishes a database that was never migrated from one that fell behind', () => {
    const message = driftMessage(compareMigrations(M, []));
    expect(message.title).toBe('BANCO DE DADOS NUNCA MIGRADO');
  });

  it('warns rather than alarms when the database is ahead', () => {
    const message = driftMessage(compareMigrations(M.slice(0, 3), appliedFor(...M)));
    expect(message.tone).toBe('warning');
    expect(message.items).toEqual([]);
    expect(message.fix).toBeNull();
  });

  it('withdraws the fix entirely when db:migrate would apply none of it', () => {
    // 0002 is missing and older than the newest applied stamp, so the migrator
    // would print nothing, apply nothing and exit 0. Offering the command anyway
    // would send Rafael to run it, see success, and believe it was fixed — the
    // same quiet wrongness the banner exists to end.
    const message = driftMessage(compareMigrations(M, appliedFor(M[0], M[1], M[3], M[4])));
    expect(message.caveat).toContain('0002_public_hobgoblin');
    expect(message.caveat).toContain('NÃO');
    expect(message.fix).toBeNull();
  });

  it('keeps the fix when db:migrate would still apply part of it', () => {
    // 0001 will be skipped; 0003 and 0004 will not. Both facts get shown.
    const message = driftMessage(compareMigrations(M, appliedFor(M[0], M[2])));
    expect(message.caveat).toContain('0001_handy_peter_parker');
    expect(message.fix).toBe('npm run db:migrate');
  });

  it('agrees in number, singular and plural', () => {
    expect(driftMessage(compareMigrations(M, appliedFor(M[0], M[1], M[2], M[3]))).body)
      .toContain('1 migração');
    expect(driftMessage(compareMigrations(M, appliedFor(M[0], M[1]))).body).toContain('3 migrações');
  });

  it('never claims all clear when the check itself failed', () => {
    expect(DRIFT_CHECK_UNAVAILABLE.tone).toBe('warning');
    expect(DRIFT_CHECK_UNAVAILABLE.title).toContain('Não foi possível');
  });

  it('is entirely pt-BR — this is a panel, not a log', () => {
    const drifts = [
      compareMigrations(M, appliedFor(...M)),
      compareMigrations(M, appliedFor(M[0])),
      compareMigrations(M, []),
      compareMigrations(M.slice(0, 3), appliedFor(...M)),
      compareMigrations(M, [...appliedFor(M[0]), { createdAt: 1 }]),
    ];
    for (const message of [...drifts.map(driftMessage), DRIFT_CHECK_UNAVAILABLE]) {
      const prose = `${message.title} ${message.body} ${message.caveat ?? ''}`;
      // Every sentence carries at least one accented Portuguese word, and none of
      // them is an English word this codebase has ever leaked into a panel.
      expect(prose).toMatch(/[áàâãéêíóôõúç]/i);
      expect(prose).not.toMatch(/\b(database|migration|missing|applied|drift)\b/i);
    }
  });
});

describe('where the check is wired', () => {
  const SRC = join(process.cwd(), 'src');
  const PLATFORM = join(SRC, 'lib/repo/platform.ts');

  function walk(dir: string): string[] {
    let out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out = out.concat(walk(full));
      else if (/\.tsx?$/.test(full)) out.push(full);
    }
    return out;
  }

  /** A statement against the migrations table, as opposed to prose naming it —
   *  several files below explain what the table is and why they must not touch
   *  it, and a rule that cannot tell an explanation from a query is a rule that
   *  punishes documenting the boundary. */
  const QUERIES_MIGRATIONS_TABLE = /(from|into|update|table|truncate)\s+drizzle\.__drizzle_migrations/i;

  it('queries drizzle.__drizzle_migrations from nowhere but the owner-only repo', () => {
    /** tests/privilege-boundary.test.ts stops church-facing code IMPORTING
     *  platform.ts. It cannot stop someone writing the same raw SQL somewhere
     *  else, which would land cross-church infrastructure state inside the church
     *  panel without tripping a single existing test. The migrations table has no
     *  church_id to scope it by and describes the whole deployment, so there is
     *  exactly one file it may be read from. */
    const files = walk(SRC).filter((f) => f !== PLATFORM);
    expect(files.length).toBeGreaterThan(40);
    const offenders = files.filter((f) => QUERIES_MIGRATIONS_TABLE.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    // Guard against the regex quietly matching nothing anywhere, which would make
    // the assertion above pass for the wrong reason.
    expect(QUERIES_MIGRATIONS_TABLE.test(readFileSync(PLATFORM, 'utf8'))).toBe(true);
  });

  it('keeps the comparison pure — no database, no filesystem, no framework', () => {
    // The comparison is testable in every drift state precisely because it is a
    // function over two lists. One import of the db client and it stops being
    // one, and the states below stop being reachable from a test.
    const source = readFileSync(join(SRC, 'lib/migration-drift.ts'), 'utf8');
    expect(source).not.toMatch(/from '(@\/db\/client|node:\w+|next\/\w+|drizzle-orm)/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it('puts the alarm above everything else on the owner console', () => {
    // /owner is the screen Rafael actually opens; a log is not. If the database
    // is behind, it has to be the first thing there, not something under a fold
    // of church cards.
    const page = readFileSync(join(SRC, 'app/owner/(protected)/page.tsx'), 'utf8');
    const alert = page.indexOf('<MigrationDriftAlert');
    expect(alert).toBeGreaterThan(-1);
    expect(alert).toBeLessThan(page.indexOf('<h1>'));
  });

  it('never reaches the church panel', () => {
    // The argued decision, kept honest by a test rather than by memory. See the
    // header of MigrationDriftAlert.tsx for why a church is told nothing here.
    const churchFacing = walk(join(SRC, 'app/admin')).concat(walk(join(SRC, 'app/api')));
    const offenders = churchFacing.filter((f) => /MigrationDrift|migration-drift/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  // NAMED FOR WHAT IT CHECKS, not for what we wish it checked. An earlier title
  // called this a deploy gate; it is not one. Nothing invokes db:check — `build`
  // is plain `next build` and there is no vercel.json — so the gate exists and
  // never runs, and a test claiming otherwise reads as protection to whoever
  // skims it. Wiring it into the build is a deployment decision (it needs
  // DATABASE_URL at build time, and a wrong call there fails every deploy), so it
  // is written down as a launch step rather than switched on unilaterally.
  it('provides a db:check script that exits non-zero and names its fix', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['db:check']).toBe('tsx scripts/db-check.ts');

    const script = readFileSync(join(process.cwd(), 'scripts/db-check.ts'), 'utf8');
    expect(script).toContain('process.exitCode = 1');
    // It must name the fix, not just the fault — the reader is mid-incident.
    expect(script).toContain('npm run db:migrate');
    // And it must refuse to pass when it could not look at anything at all.
    expect(script).toContain('DATABASE_URL');
  });
});

/** THE READ EDGE, against a real Postgres.
 *
 *  Worth a PGlite instance for one reason above all: created_at is a `bigint`,
 *  and every driver in this project hands a bigint back as a STRING. Left
 *  unconverted, '1786369208803' matches no journal entry, and a perfectly
 *  healthy production database renders the red alarm on /owner every time. The
 *  only way to catch that is to make a real engine answer the real query. */
describe('readAppliedMigrations', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = (globalThis as Record<string, unknown>).__migrationDriftClient as PGlite;
    await client.waitReady;
  });

  async function createMigrationsTable(): Promise<void> {
    // Byte for byte the DDL drizzle's own migrator runs.
    await client.query('create schema if not exists drizzle');
    await client.query(
      'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
    );
  }

  it('returns [] when the migrations table does not exist at all', async () => {
    // A database drizzle-kit migrate has never completed against. Not an error:
    // "nothing applied" is a true and complete answer, and the caller reports it
    // as total drift rather than crashing the owner console.
    //
    // This assertion found a real bug. drizzle does not rethrow the driver's
    // error — it wraps it in `Failed query: …` and hangs the original, with its
    // SQLSTATE, off `.cause`. The first version read `error.code`, found
    // undefined, and rethrew, so a never-migrated database produced a 500 on
    // /owner instead of the banner explaining it. No amount of reasoning about
    // the driver would have shown that; only asking a real engine did.
    await expect(readAppliedMigrations()).resolves.toEqual([]);
  });

  it('returns [] for an empty migrations table', async () => {
    await createMigrationsTable();
    await expect(readAppliedMigrations()).resolves.toEqual([]);
  });

  it('reads bigint created_at back as a NUMBER, not the string Postgres sends', async () => {
    await createMigrationsTable();
    await client.query(
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ('h0', 1784141586735), ('h1', 1786114186658)",
    );

    const applied = await readAppliedMigrations();
    expect(applied).toEqual([{ createdAt: 1784141586735 }, { createdAt: 1786114186658 }]);
    for (const row of applied) expect(typeof row.createdAt).toBe('number');
  });

  it('compares clean against the real journal once the real stamps are in', async () => {
    // End to end over both edges: journal import, database read, comparison.
    await createMigrationsTable();
    await client.query('truncate drizzle.__drizzle_migrations');
    for (const migration of EXPECTED_MIGRATIONS) {
      await client.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [
        migration.tag,
        migration.when,
      ]);
    }
    const drift = compareMigrations(EXPECTED_MIGRATIONS, await readAppliedMigrations());
    expect(drift.status).toBe('in_sync');
  });

  it('sees the 0005 incident: the newest migration generated but never applied', async () => {
    await createMigrationsTable();
    await client.query('truncate drizzle.__drizzle_migrations');
    for (const migration of EXPECTED_MIGRATIONS.slice(0, -1)) {
      await client.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [
        migration.tag,
        migration.when,
      ]);
    }
    const drift = compareMigrations(EXPECTED_MIGRATIONS, await readAppliedMigrations());
    expect(drift.status).toBe('behind');
    expect(drift.missing.map((m) => m.tag)).toEqual([
      EXPECTED_MIGRATIONS[EXPECTED_MIGRATIONS.length - 1].tag,
    ]);
    expect(blocksDeploy(drift)).toBe(true);
  });

  // LAST on purpose: it leaves the migrations table in a broken shape.
  it('throws instead of reporting all clear when the query fails for another reason', async () => {
    // The other half of the missing-table rule. "Nothing applied" is only a safe
    // answer for a table that is not there — for a table whose created_at column
    // is not there, a database this code cannot read would be reported as a
    // database with no drift, on the one screen that exists to say otherwise.
    // Postgres phrases this one as `column "created_at" does not exist`, so it is
    // also what pins the two text conditions to the same layer of the chain.
    await client.query('drop schema if exists drizzle cascade');
    await client.query('create schema drizzle');
    await client.query(
      'create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, applied_at bigint)',
    );
    await expect(readAppliedMigrations()).rejects.toThrow();
  });
});
