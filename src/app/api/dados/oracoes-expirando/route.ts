import { blockedMessage, checkDataRightsSession } from '@/lib/auth/writable';
import { EXPIRING_WINDOW_MS } from '@/lib/expiring-window';
import { exportFooter } from '@/lib/member-export';
import { retentionCutoff } from '@/lib/retention';
import { getChurchById } from '@/lib/repo/church-admin';
import { pageExpiringPrayers } from '@/lib/repo/prayer-admin';

/** The export offered beside the 30-day warning. THIRD and last caller of
 *  checkDataRightsSession — a fourth fails tests/privilege-boundary.test.ts.
 *
 *  Grants no new reading power: the Oração page already shows a suspended church
 *  every prayer request it holds. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const ROW_CEILING = 50_000;
const BUDGET_MS = 45_000;

export async function GET(request: Request): Promise<Response> {
  const session = await checkDataRightsSession();
  if ('blocked' in session) {
    return Response.json(
      { error: blockedMessage(session.blocked) },
      { status: session.blocked === 'unauthenticated' ? 401 : 403 },
    );
  }
  const { churchId } = session;

  const now = new Date();
  const before = new Date(retentionCutoff(now).getTime() + EXPIRING_WINDOW_MS);
  const church = await getChurchById(churchId);

  const raw = new URL(request.url).searchParams.get('apos');
  const m = raw ? /^oracoes:(.+),([0-9a-f-]{36})$/.exec(raw) : null;
  const resume = m && !Number.isNaN(new Date(m[1]).getTime())
    ? { createdAt: new Date(m[1]), id: m[2] }
    : null;

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  /** Same shape as the member export, and for the same reason: the generator frame
   *  is what carries `first`, `after` and `emitted` across the pull() boundaries
   *  backpressure introduces. See the long comment on the member export route —
   *  this one collection is the simple case of that one. */
  async function* documentChunks(): AsyncGenerator<string, void, void> {
    yield `{"gerado_em":${JSON.stringify(now.toISOString())}`;
    yield `,"igreja":${JSON.stringify(church?.name ?? '')}`;
    yield `,"pedidos_de_oracao":[`;

    let after = resume;
    let emitted = 0;
    let first = true;
    let stopped: { createdAt: Date; id: string } | null = null;

    for (;;) {
      const rows = await pageExpiringPrayers(churchId, before, after, PAGE_SIZE);
      for (const row of rows) {
        // The separator rides in the SAME chunk as the row it precedes, so there
        // is no state in which a comma was emitted and its row was not.
        //
        // nome and whatsapp are INCLUDED here, unlike the member export: this
        // file goes to the controller, not to a member, and a prayer request
        // the church cannot attach to a person is pastorally worthless.
        yield `${first ? '' : ','}${JSON.stringify({
          quando: row.createdAt.toISOString(),
          situacao: row.status,
          texto: row.text,
          nome: row.contactName,
          whatsapp: row.contactPhone,
        })}`;
        first = false;
        emitted += 1;
        after = { createdAt: row.createdAt, id: row.id };
      }
      if (rows.length < PAGE_SIZE) break;
      if (emitted >= ROW_CEILING || Date.now() - startedAt > BUDGET_MS) { stopped = after; break; }
    }
    // Reached by BOTH breaks and by no other path, so the array closes exactly
    // once whether the loop ran out of rows, hit the ceiling or hit the budget.
    yield ']';

    const footer = exportFooter({
      truncatedAt: stopped ? stopped.createdAt : null,
      continuation: stopped ? `oracoes:${stopped.createdAt.toISOString()},${stopped.id}` : null,
    });
    for (const [k, v] of Object.entries(footer)) yield `,${JSON.stringify(k)}:${JSON.stringify(v)}`;
    yield '}';
  }

  const chunks = documentChunks();

  const stream = new ReadableStream<Uint8Array>(
    {
      // pull(), not start(). This file is the most sensitive artifact the
      // subsystem produces AND the one with no per-contact bound on its size — a
      // whole church's expiring archive — so producing it ahead of the reader is
      // the version of this route that most deserved not to exist.
      async pull(controller) {
        try {
          do {
            const next = await chunks.next();
            if (next.done) {
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode(next.value));
          } while ((controller.desiredSize ?? 0) > 0);
        } catch (error) {
          console.error('[dados] expiring-prayers stream failed', error);
          controller.error(error);
        }
      },
      async cancel() {
        // Ends the generator frame and drops the page of prayer requests — names,
        // numbers and texts — it was holding for a reader that has gone away.
        await chunks.return(undefined);
      },
    },
    new CountQueuingStrategy({ highWaterMark: 1 }),
  );

  const stamp = now.toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="pedidos-de-oracao-a-expirar-${stamp}.json"`,
    },
  });
}
