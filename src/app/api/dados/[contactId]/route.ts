import { blockedMessage, checkDataRightsSession } from '@/lib/auth/writable';
import {
  exportFooter,
  exportHeader,
  exportMessageEntry,
  exportPrayerEntry,
} from '@/lib/member-export';
import { getChurchById } from '@/lib/repo/church-admin';
import {
  countMemberRows,
  loadMemberSubject,
  pageMessages,
  pagePrayers,
  type Cursor,
} from '@/lib/repo/member-data';

/** Art. 18 V — the member's copy, streamed.
 *
 *  NOT decoration: without maxDuration this route inherits Vercel's 10 s default
 *  and the 45 s budget below never applies, so the whole bounding design would be
 *  dead code on precisely the member with the most data. No file under src/ set
 *  maxDuration before this subsystem. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const ROW_CEILING = 50_000;
const BUDGET_MS = 45_000;

function parseCursor(raw: string | null): { collection: 'mensagens' | 'oracoes'; cursor: Cursor } | null {
  if (!raw) return null;
  // <colecao>:<iso>,<uuid> — neither half is personal data: the id is a
  // defaultRandom() UUID identifying a row, not a person, and it is the same class
  // of value as the contactId already in the path.
  const m = /^(mensagens|oracoes):(.+),([0-9a-f-]{36})$/.exec(raw);
  if (!m) return null;
  const at = new Date(m[2]);
  if (Number.isNaN(at.getTime())) return null;
  return { collection: m[1] as 'mensagens' | 'oracoes', cursor: { createdAt: at, id: m[3] } };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactId: string }> },
): Promise<Response> {
  const { contactId } = await params;

  // The non-redirecting guard: a route that let NEXT_REDIRECT escape would
  // serialise a framework control-flow signal into its own JSON body.
  const session = await checkDataRightsSession();
  if ('blocked' in session) {
    return Response.json(
      { error: blockedMessage(session.blocked) },
      { status: session.blocked === 'unauthenticated' ? 401 : 403 },
    );
  }
  const { churchId } = session;

  const subject = await loadMemberSubject(churchId, contactId);
  if (!subject) return Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });
  // Re-bound to a variable TypeScript can prove is never null: narrowing from the
  // guard above does not survive into the nested async generator closure below,
  // since `contact` there is a fresh binding as far as control-flow analysis of a
  // separate function scope is concerned.
  const contact: typeof subject = subject;

  const [counts, church] = await Promise.all([
    countMemberRows(churchId, contactId),
    getChurchById(churchId),
  ]);

  const resume = parseCursor(new URL(request.url).searchParams.get('apos'));
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  /** The whole document, in order, as a sequence of chunks — and the ONLY thing
   *  that holds state between them.
   *
   *  A generator rather than a loop inside start() FOR THE COMMA LOGIC. Under
   *  backpressure, production stops mid-array and resumes on a later pull(), and
   *  `first` — the flag deciding whether a row is preceded by a comma — is exactly
   *  the state that has to survive that suspension. Hoisting `first`, `after` and
   *  `emitted` out into a hand-rolled state machine would move the one bug that
   *  emits `[,{…}]` or `[{…}{…}]` into the seam between two pulls, which is the
   *  seam a test reaches last. A suspended generator frame keeps them where they
   *  were written: the drain loop below is the same loop as before and `yield` is
   *  the only new statement in it. */
  async function* documentChunks(): AsyncGenerator<string, void, void> {
    const header = exportHeader({
      churchName: church?.name ?? '',
      contact,
      counts: { messages: counts.messages, prayers: counts.prayers },
      now: new Date(),
    });
    // Written by hand rather than JSON.stringify'ing the whole document: the
    // whole point is that no page is ever all in memory at once.
    yield `{"gerado_em":${JSON.stringify(header.gerado_em)}`;
    yield `,"igreja":${JSON.stringify(header.igreja)}`;
    yield `,"titular":${JSON.stringify(header.titular)}`;

    let truncatedAt: Date | null = null;
    let continuation: string | null = null;

    /** One collection, paged. Returns the cursor it stopped at, or null if it ran
     *  to completion — `yield*` at the call site hands that return value back. */
    async function* drain<T extends { id: string; createdAt: Date }>(
      key: string,
      load: (after: Cursor | null, limit: number) => Promise<T[]>,
      entry: (row: T) => unknown,
      from: Cursor | null,
      skip: boolean,
    ): AsyncGenerator<string, Cursor | null, void> {
      yield `,"${key}":[`;
      if (skip) { yield ']'; return null; }

      let after = from;
      let emitted = 0;
      let first = true;
      for (;;) {
        // `rows` is a local of this frame, so exactly one page is reachable while
        // the generator is suspended below — and the next page is not requested
        // until this one has been yielded row by row.
        const rows = await load(after, PAGE_SIZE);
        for (const row of rows) {
          // The separator travels in the SAME chunk as the row it precedes.
          // Two chunks would admit a state where the comma was enqueued and the
          // row was not; an error or a cancel landing between them closes the
          // array on a trailing comma, which is the one way this loop could emit
          // invalid JSON.
          yield `${first ? '' : ','}${JSON.stringify(entry(row))}`;
          first = false;
          emitted += 1;
          after = { createdAt: row.createdAt, id: row.id };
        }
        // Bounded by BOTH: rows, and wall clock. The ceiling is predictable
        // from a count; the budget is not, which is why the resume point is
        // written into the file rather than guessed by the panel.
        if (rows.length < PAGE_SIZE) { yield ']'; return null; }
        if (emitted >= ROW_CEILING || Date.now() - startedAt > BUDGET_MS) {
          yield ']';
          return after;
        }
      }
    }

    // Messages first, then prayers — so truncation is either mid-messages
    // (prayers not started) or mid-prayers (messages complete). One truncation
    // point, therefore one cursor.
    const resumingPrayers = resume?.collection === 'oracoes';
    const stoppedMessages = yield* drain(
      'mensagens',
      (after, limit) => pageMessages(churchId, contactId, after, limit),
      exportMessageEntry,
      resume?.collection === 'mensagens' ? resume.cursor : null,
      resumingPrayers,
    );
    if (stoppedMessages) {
      truncatedAt = stoppedMessages.createdAt;
      continuation = `mensagens:${stoppedMessages.createdAt.toISOString()},${stoppedMessages.id}`;
      yield `,"pedidos_de_oracao":[]`;
    } else {
      const stoppedPrayers = yield* drain(
        'pedidos_de_oracao',
        (after, limit) => pagePrayers(churchId, contactId, after, limit),
        exportPrayerEntry,
        resumingPrayers ? resume!.cursor : null,
        false,
      );
      if (stoppedPrayers) {
        truncatedAt = stoppedPrayers.createdAt;
        continuation = `oracoes:${stoppedPrayers.createdAt.toISOString()},${stoppedPrayers.id}`;
      }
    }

    const footer = exportFooter({ truncatedAt, continuation });
    for (const [k, v] of Object.entries(footer)) yield `,${JSON.stringify(k)}:${JSON.stringify(v)}`;
    yield '}';
  }

  const chunks = documentChunks();

  const stream = new ReadableStream<Uint8Array>(
    {
      // pull(), not start(): the stream asks, the generator answers. An enqueue
      // loop in start() has no backpressure at all — it fills the internal queue
      // whether or not anyone is reading, which made peak memory a function of
      // ROW_CEILING × an unbounded message.body instead of PAGE_SIZE.
      async pull(controller) {
        try {
          // Produce until the queue is full, then RETURN. Returning while the
          // queue is full is the entire mechanism: the stream calls pull() again
          // only once the consumer has drained what is there.
          do {
            const next = await chunks.next();
            if (next.done) {
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode(next.value));
          } while ((controller.desiredSize ?? 0) > 0);
        } catch (error) {
          // A stream that has already emitted bytes cannot become a 500. Erroring
          // it is the honest end: the panel sees invalid JSON and shows the
          // failure string rather than handing the secretary a truncated file that
          // looks complete. `desiredSize` reads null once the stream is errored or
          // closed, and `?? 0` makes that end the loop rather than spin it.
          console.error('[dados] export stream failed', error);
          controller.error(error);
        }
      },
      async cancel() {
        // The secretary navigated away or the connection dropped mid-download.
        // Returning the generator ends its frame and drops the page of rows it was
        // holding; without this the suspended frame — and that page — waits on a
        // pull() that will never come.
        await chunks.return(undefined);
      },
    },
    // Stated rather than inherited. highWaterMark is the number the pull() loop
    // above compares `desiredSize` against, so it IS the queue bound this route
    // advertises; a platform default that changed under us would change that bound
    // silently. One chunk is one row.
    new CountQueuingStrategy({ highWaterMark: 1 }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      // No phone and no name: this lands in a shared secretariat's Downloads.
      'content-disposition': `attachment; filename="dados-membro-${contactId.slice(0, 6)}-${stamp}.json"`,
    },
  });
}
