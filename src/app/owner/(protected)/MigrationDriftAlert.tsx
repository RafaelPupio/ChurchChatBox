import { compareMigrations } from '@/lib/migration-drift';
import { DRIFT_CHECK_UNAVAILABLE, driftMessage, type DriftMessage } from '@/lib/migration-drift-messages';
import { EXPECTED_MIGRATIONS } from '@/lib/migrations-journal';
import { readAppliedMigrations } from '@/lib/repo/platform';

/** THE PLACE THIS WOULD ACTUALLY HAVE BEEN SEEN.
 *
 *  Both incidents were shipped, ran, and were found by a human running a
 *  simulation — not by a log, because Rafael does not open logs, and not by the
 *  test suite, which runs on a PGlite where every migration is applied by
 *  definition. What he does open is /owner. So the check runs on the render of
 *  his home page and puts itself above the list of churches, ahead of anything
 *  else on the screen.
 *
 *  It costs one extra round trip to Neon on a page one person loads. That is the
 *  cheapest thing in this repo relative to what it is buying.
 *
 *  Deliberately NOT rendered in the church panel at /admin. The argument, since
 *  a church staring at a dead bot deserves better than nothing:
 *
 *   1. Reading drizzle.__drizzle_migrations means importing the owner-only repo,
 *      and tests/privilege-boundary.test.ts fails any church-facing file that
 *      does. That rule is not a technicality to work around here — cross-church
 *      infrastructure state is the exact category it exists to contain.
 *   2. The church cannot act on it. "O banco de dados do sistema está
 *      desatualizado" tells a secretary something true, unactionable and
 *      alarming, and turns one incident Rafael is already fixing into N support
 *      calls he has to answer while fixing it.
 *   3. What a church actually needs is not the cause but the symptom, and
 *      someone owning it: "o bot está fora do ar, já sabemos, estamos
 *      resolvendo". That is a different feature — an operator-set incident
 *      banner, written by a human, read from a church-visible field — and
 *      building it by widening the owner boundary would be the wrong trade. It
 *      is worth building; it is not this. */
export async function MigrationDriftAlert() {
  let message: DriftMessage;
  try {
    message = driftMessage(compareMigrations(EXPECTED_MIGRATIONS, await readAppliedMigrations()));
  } catch (error) {
    // Logged as well as shown: the banner says the check failed, the log says why.
    console.error('[migration-drift] could not read drizzle.__drizzle_migrations', error);
    message = DRIFT_CHECK_UNAVAILABLE;
  }

  if (message.tone === 'ok') {
    return (
      <p className="hint">
        ✅ {message.title} — {message.body}
      </p>
    );
  }

  return (
    <section className={message.tone === 'alarm' ? 'alarm' : 'alarm alarm-warn'}>
      <h2>
        {message.tone === 'alarm' ? '🚨' : '⚠️'} {message.title}
      </h2>
      <p>{message.body}</p>
      {message.items.length > 0 && (
        <ul>
          {message.items.map((tag) => (
            <li key={tag}>
              <code>{tag}</code>
            </li>
          ))}
        </ul>
      )}
      {message.caveat && (
        <p>
          <strong>{message.caveat}</strong>
        </p>
      )}
      {message.fix && (
        <p>
          No terminal: <code>{message.fix}</code>
        </p>
      )}
    </section>
  );
}
