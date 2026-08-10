import { listRecentWebhookFailures, type WebhookFailureSummary } from '@/lib/repo/platform';
import { timeAgo } from '@/lib/relative-time';
import { FAILURE_WINDOW_MS, schemaDriftHint } from '@/lib/webhook-failure';

/** WHERE A SILENT BOT BECOMES A VISIBLE ONE.
 *
 *  The webhook always answers Meta with 200 — a non-200 makes Meta retry and a
 *  retry means a member is answered twice — so when its catch block fires, the
 *  outside world sees a perfectly healthy integration and the member sees
 *  nothing. On 2026-08-10 that lasted hours across every church, and the only
 *  reason anyone found out is that a human happened to run a simulation.
 *
 *  console.error was already there and changed nothing: nobody reads a Vercel log
 *  at 09:00 on a Sunday. /owner is the page Rafael actually opens, so the alarm
 *  goes here, above the list of churches.
 *
 *  Reused .alarm styling rather than a new class, so "something is broken" looks
 *  the same in this console no matter which check noticed it. */
export async function WebhookFailureAlert() {
  const now = new Date();
  let failures: WebhookFailureSummary[];

  try {
    failures = await listRecentWebhookFailures(new Date(now.getTime() - FAILURE_WINDOW_MS));
  } catch (error) {
    // The alarm's own read must never take down the page it is trying to warn
    // on — including in the exact scenario it exists for, where this very table
    // is the one the live database has not been migrated for yet.
    console.error('[webhook-failure] could not read webhook_failure', error);
    return (
      <section className="alarm alarm-warn">
        <h2>⚠️ Não foi possível ler o registro de falhas</h2>
        <p>
          A consulta ao registro de falhas do webhook não respondeu. Isto não quer dizer que
          está tudo bem — quer dizer que não deu para olhar.
        </p>
      </section>
    );
  }

  if (failures.length === 0) {
    return (
      <p className="hint">
        ✅ Nenhuma falha do webhook nas últimas 24 horas. Vale lembrar o limite: a falha é
        gravada no próprio banco, então uma queda do banco não aparece aqui — some sem deixar
        registro.
      </p>
    );
  }

  const total = failures.reduce((sum, failure) => sum + failure.failureCount, 0);
  const churchCount = new Set(failures.map((failure) => failure.churchId)).size;

  return (
    <section className="alarm">
      <h2>🚨 A secretária virtual falhou ao responder</h2>
      <p>
        {plural(total, 'falha', 'falhas')} em {plural(churchCount, 'igreja', 'igrejas')} nas
        últimas 24 horas. Cada uma é uma mensagem de uma pessoa que a secretária não conseguiu
        responder normalmente.
      </p>
      <ul>
        {failures.map((failure) => {
          const hint = schemaDriftHint(failure.reason);
          return (
            <li key={`${failure.churchId ?? 'sem-igreja'}|${failure.reason}`}>
              <strong>{failure.churchName ?? 'Igreja não identificada'}</strong>
              {' — '}
              {plural(failure.failureCount, 'falha', 'falhas')}, a última {timeAgo(failure.lastSeenAt, now)}
              {failure.failureCount > 1 && <> (começou {timeAgo(failure.firstSeenAt, now)})</>}
              {/* The database's own words, redacted and truncated but never
                  rewritten. The sentence that names the missing column is the
                  entire diagnostic value of this screen. */}
              <br />
              <code>{failure.reason}</code>
              {hint && (
                <>
                  <br />
                  {hint}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p>
        Uma falha antes de identificar a igreja aparece sem nome: foi exatamente o que
        aconteceu no dia 10/08, quando a consulta que descobre a igreja era a que quebrava.
      </p>
    </section>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
