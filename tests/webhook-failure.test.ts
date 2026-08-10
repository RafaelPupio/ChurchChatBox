import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAILURE_WINDOW_MS, MAX_REASON_LENGTH, schemaDriftHint, toFailureReason } from '@/lib/webhook-failure';
import { timeAgo } from '@/lib/relative-time';

/** The pure half of the webhook failure alarm. tests/webhook-alarm.test.ts drives
 *  the real route handler against a real Postgres; this file pins the rules that
 *  decide WHAT gets stored and how it reads, which are the rules that decide
 *  whether the alarm aggregates or floods. */

describe('toFailureReason', () => {
  it('keeps the sentence that names the missing column', () => {
    // The literal shape of both incidents this week. If this ever stops being
    // legible, the alarm fires and still tells nobody anything.
    const reason = toFailureReason(new Error('column "courtesy_text" does not exist'));
    expect(reason).toBe('column "courtesy_text" does not exist');
  });

  it('digs the Postgres sentence out of the wrapper drizzle throws', () => {
    // THE BUG THIS TEST EXISTS FOR, found by running the alarm rather than
    // reading it. Drizzle does not rethrow the driver's error; it wraps it, and
    // the wrapper's message is the whole SQL statement. Recording that verbatim
    // produced "Failed query: select "id", "name", "phone_number_id", …" —
    // truncated at 200 characters, still inside the column list, having said
    // nothing. What the outage was ABOUT sits one level down in `cause`.
    const pgError = Object.assign(new Error('column church.courtesy_text does not exist'), { code: '42703' });
    const wrapped = new Error(
      'Failed query: select "id", "name", "phone_number_id", "access_token", "webhook_verify_token" from "church"',
      { cause: pgError },
    );

    const reason = toFailureReason(wrapped);

    expect(reason).toBe('[42703] column church.courtesy_text does not exist');
    expect(reason).not.toMatch(/Failed query/);
    expect(schemaDriftHint(reason)).toMatch(/migração/);
  });

  it('keeps the parent message when the cause has none', () => {
    const reason = toFailureReason(new Error('algo quebrou', { cause: new Error('') }));
    expect(reason).toBe('algo quebrou');
  });

  it('classifies by SQLSTATE, which no locale rewrites', () => {
    // Postgres translates its messages (lc_messages); it never translates the
    // code. A database that answers in another language must still raise the
    // alarm's one useful hint.
    const translated = Object.assign(new Error('coluna church.courtesy_text não existe'), { code: '42703' });
    expect(schemaDriftHint(toFailureReason(translated))).toMatch(/migração/);
  });

  it('collapses a multi-line driver error onto one line', () => {
    const reason = toFailureReason(new Error('NeonDbError: syntax error\n  at position 42\n\n  hint: nope'));
    expect(reason).toBe('NeonDbError: syntax error at position 42 hint: nope');
  });

  it('redacts a member phone number out of a constraint violation', () => {
    // The most likely violation in this webhook is contact_church_phone_uq, and
    // Postgres puts the VALUE in the message. This table is cross-church and the
    // vendor reads it; members' numbers must not silently pile up in it.
    const reason = toFailureReason(
      new Error('duplicate key value violates unique constraint "contact_church_phone_uq" Key (phone)=(5511999990000)'),
    );
    expect(reason).not.toContain('5511999990000');
    expect(reason).toContain('<num>');
    expect(reason).toContain('contact_church_phone_uq');
  });

  it('redacts uuids, so one broken church is one row and not one row per message', () => {
    // This is the aggregation, not tidiness: the row key is (church_id, reason),
    // so a reason carrying a per-message id would insert a fresh row every time
    // and reproduce the thousands-of-identical-rows flood the design avoids.
    const first = toFailureReason(new Error('insert failed for 4f0c2f8e-9e4a-4f6d-9a35-2c9de3f6a1b2'));
    const second = toFailureReason(new Error('insert failed for 91cbe30d-31b5-4c47-8f5a-7d0e5b2a44c1'));
    expect(first).toBe(second);
    expect(first).toBe('insert failed for <id>');
  });

  it('keeps short numbers, which are diagnosis rather than identity', () => {
    expect(toFailureReason(new Error('Graph API responded 429'))).toBe('Graph API responded 429');
  });

  it('truncates a runaway message', () => {
    const reason = toFailureReason(new Error('x'.repeat(5000)));
    expect(reason).toHaveLength(MAX_REASON_LENGTH);
    expect(reason.endsWith('…')).toBe(true);
  });

  it('survives a thrown value that is not an Error', () => {
    expect(toFailureReason('só um texto')).toBe('só um texto');
  });

  it('never returns an empty string, because the column is NOT NULL', () => {
    // `throw new Error('')`, `throw null` and `throw undefined` are all legal,
    // and an empty reason would make the alarm's own INSERT fail — the recording
    // defeated by exactly the kind of strangeness it exists to record. All three
    // collapse to one sentence on purpose: "something threw with nothing to say"
    // is the whole content of each of them, and a row reading `null` teaches a
    // reader nothing that this does not.
    expect(toFailureReason(new Error(''))).toBe('Falha sem mensagem');
    expect(toFailureReason('   ')).toBe('Falha sem mensagem');
    expect(toFailureReason(null)).toBe('Falha sem mensagem');
    expect(toFailureReason(undefined)).toBe('Falha sem mensagem');
  });
});

describe('schemaDriftHint', () => {
  it.each([
    'column "courtesy_text" does not exist',
    'column church.password_changed_at does not exist',
    'relation "webhook_failure" does not exist',
  ])('recognises %s as a migration that was never applied', (reason) => {
    expect(schemaDriftHint(reason)).toMatch(/migração/);
  });

  it('stays quiet about failures it cannot explain', () => {
    expect(schemaDriftHint('Graph API responded 429')).toBeNull();
    expect(schemaDriftHint('fetch failed')).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-08-10T12:00:00Z');

  it('reads in pt-BR', () => {
    expect(timeAgo(new Date('2026-08-10T11:55:00Z'), now)).toBe('há 5 minutos');
    expect(timeAgo(new Date('2026-08-10T09:00:00Z'), now)).toBe('há 3 horas');
    expect(timeAgo(new Date('2026-08-08T12:00:00Z'), now)).toBe('há 2 dias');
  });

  it('states a duration, never a calendar day', () => {
    // Intl's 'auto' mode calls this "anteontem", which it also calls 60 hours ago.
    // An alarm reporting how long a church has been broken may not round a
    // duration into a day name.
    expect(timeAgo(new Date('2026-08-09T12:00:00Z'), now)).toBe('há 1 dia');
  });

  it('does not say "há -3 segundos" when the clocks disagree', () => {
    // Postgres writes last_seen_at with its own now(); the page formats it with
    // the app's. A second of skew must not render as a negative age.
    expect(timeAgo(new Date('2026-08-10T12:00:01Z'), now)).toBe('agora mesmo');
    expect(timeAgo(new Date('2026-08-10T11:59:59Z'), now)).toBe('agora mesmo');
  });
});

/** Static contracts. Each one is a rule that no other test in the repo states and
 *  that a plausible refactor would quietly break. */
describe('where the alarm is wired', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('the webhook records from its catch block', () => {
    const route = read('src/app/api/whatsapp/webhook/route.ts');
    const catchBlock = route.slice(route.indexOf('} catch (error) {'));
    expect(catchBlock).toMatch(/recordWebhookFailure\(/);
  });

  it('the webhook records the failure before trying to apologise', () => {
    // The apology is a best-effort message to one member over a network we
    // already know is misbehaving. The row is what still exists tomorrow.
    const route = read('src/app/api/whatsapp/webhook/route.ts');
    expect(route.indexOf('await recordWebhookFailure(')).toBeLessThan(route.indexOf('await notifyFailure('));
  });

  it('the webhook cannot read cross-church failure state', () => {
    // privilege-boundary.test.ts already bans the owner-only module outright.
    // This states the narrower rule the split exists for: the WRITE is fine here,
    // the cross-church READ never is.
    expect(read('src/app/api/whatsapp/webhook/route.ts')).not.toMatch(/listRecentWebhookFailures/);
    expect(read('src/lib/repo/webhook-failure.ts')).not.toMatch(/listRecentWebhookFailures/);
  });

  it('the recording repo is a write and nothing else', () => {
    // A select here would mean the webhook had learned to read the table that
    // holds every other tenant's failures.
    const repo = read('src/lib/repo/webhook-failure.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(repo).not.toMatch(/db\.select|db\.execute|db\.delete|db\.update/);
  });

  it('the owner console renders the alarm above the church list', () => {
    const page = read('src/app/owner/(protected)/page.tsx');
    expect(page).toMatch(/<WebhookFailureAlert \/>/);
    expect(page.indexOf('<WebhookFailureAlert />')).toBeLessThan(page.indexOf('<h1>Igrejas</h1>'));
  });

  it('the alarm survives its own read failing', () => {
    // /owner is the page this console lives on. A throw from the new query would
    // take down the whole screen — including in the exact scenario the alarm is
    // for, where the live database has not been migrated for this very table.
    expect(read('src/app/owner/(protected)/WebhookFailureAlert.tsx')).toMatch(/try\s*\{[\s\S]*catch/);
  });

  it('no raw sql fragment claims to hand back a Date', () => {
    // Found by running the owner console against the LIVE database while building
    // this alarm, not by any test: `sql<Date | null>`max(last_inbound_at)`` is an
    // assertion, and it was false. A raw fragment carries no column, so drizzle
    // applies no timestamp mapper and neon-http returns a STRING. PGlite returns
    // a Date, so the suite agreed with the type and the production driver did
    // not — the same "tests pass, live database disagrees" family as the two
    // incidents this week, and unreachable by any PGlite test for the same
    // reason. The rule is therefore stated statically: convert at the repo edge,
    // never assert.
    //
    // `sql<string | Date | null>` is the honest type and stays legal: it is what
    // makes the COMPILER demand a conversion at the repo edge. Only the flat
    // `sql<Date…>` claim — the one that quietly lies — is banned.
    const repoDir = join(process.cwd(), 'src/lib/repo');
    const offenders = readdirSync(repoDir)
      .filter((file) => file.endsWith('.ts'))
      // Comments discuss the banned form by name, including in the fix itself.
      .filter((file) => /sql<(?![^>]*string)[^>]*\bDate\b[^>]*>/
        .test(readFileSync(join(repoDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
    expect(offenders).toEqual([]);
  });

  it('the owner console says when each church last received anything', () => {
    // The one piece of "receiving but not replying" worth shipping, and it is
    // worth stating as a test because listChurches computed lastInboundAt for
    // months while the page silently discarded it. A webhook broken like
    // 2026-08-10's freezes this for every church at once.
    expect(read('src/app/owner/(protected)/page.tsx')).toMatch(/c\.lastInboundAt/);
  });

  it('the alarm shows what the database actually said', () => {
    // The reason column is the whole diagnostic value of the screen. An alarm
    // that only says "houve uma falha" is a notification, not a diagnosis.
    const alert = read('src/app/owner/(protected)/WebhookFailureAlert.tsx');
    expect(alert).toMatch(/\{failure\.reason\}/);
    expect(alert).toMatch(/schemaDriftHint/);
    // A failure with no church must still be legible, in pt-BR.
    expect(alert).toContain('Igreja não identificada');
  });

  it('the quiet state admits what it cannot see', () => {
    // Requirement, not decoration: this alarm records to the database, so it
    // needs the very thing most likely to be down. "Nenhuma falha" would
    // otherwise read as "tudo certo" on a day when nothing could be recorded at
    // all. Deleting this sentence should break a test, which is why it is here.
    const alert = read('src/app/owner/(protected)/WebhookFailureAlert.tsx');
    const quietBranch = alert.slice(alert.indexOf('failures.length === 0'), alert.indexOf('const total'));
    expect(quietBranch).toMatch(/banco/);
  });

  it('the same window governs the count and the display', () => {
    // One constant, one meaning: "an incident is what has failed in the last 24h".
    // If the writer's reset window were longer than the reader's, a count could
    // survive on screen from an incident nobody can see the rows of.
    expect(FAILURE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(read('src/lib/repo/webhook-failure.ts')).toMatch(/FAILURE_WINDOW_MS/);
    expect(read('src/app/owner/(protected)/WebhookFailureAlert.tsx')).toMatch(/FAILURE_WINDOW_MS/);
  });
});
