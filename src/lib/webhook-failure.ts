/** Pure helpers for the webhook's failure alarm. No I/O — the write lives in
 *  src/lib/repo/webhook-failure.ts and the owner-only read in repo/platform.ts.
 *
 *  WHAT THIS ALARM CANNOT SEE, stated here rather than buried in a report:
 *  it records to Postgres, so it needs the very thing that is most likely to be
 *  down. If Neon is unreachable — or the connection string is wrong, or the
 *  project is suspended for billing — the webhook fails, the recording of that
 *  failure fails too, and /owner shows nothing at all. This covers the failure we
 *  actually had twice (a query error against a REACHABLE database: a column the
 *  code selects that the live schema does not have), not the failure where the
 *  database itself is gone. Nothing that lives inside this application can cover
 *  that one; it needs a second system that is not this database.
 *
 *  WHY THERE IS NO "RECEIVING BUT NOT REPLYING" DETECTOR, since it is the
 *  obvious next idea and looks free — the `message` table already holds inbound
 *  and outbound rows, so a church with inbound and no outbound in a window is one
 *  query away. It was designed, and rejected, for three reasons:
 *
 *  1. IT IS BLIND TO THE INCIDENT IT IS FOR. Read the webhook's order: the church
 *     lookup runs BEFORE findOrCreateContact and recordInboundMessage. On
 *     2026-08-10 the lookup itself threw, so not one inbound row was ever
 *     written. A church broken that exact way does not look like "receiving and
 *     not replying" — it looks IDLE, identical to a church nobody messaged. The
 *     detector would have been silent on the day it was built for.
 *  2. ITS FALSE POSITIVES ARE STRUCTURAL, not tunable. A contact in `human` mode
 *     gets no bot reply BY DESIGN (menu-router returns nothing), and a suspended
 *     church records every inbound while sending nothing BY DESIGN. Both are
 *     indistinguishable from the bug in that query, so it would cry outage over a
 *     normal Sunday handoff — and an alarm that cries wolf is worse than no alarm,
 *     because it trains the one person who reads it to scroll past.
 *  3. WHAT IT ADDS IS THIN. Any failure that throws after the inbound row is
 *     written is ALREADY recorded here, with the church attached. The residue is
 *     "silence with no exception", which is a real but much smaller risk than the
 *     one that has now bitten twice.
 *
 *  The honest, cheap piece of that idea IS shipped: /owner shows each church's
 *  last received message. A webhook broken like 2026-08-10 freezes
 *  contact.last_inbound_at for EVERY church at once, so "há 3 dias" down the whole
 *  list is that outage's fingerprint. It is presented as data and not as an alarm,
 *  because a quiet church on a Tuesday is also quiet. */

/** How long a failure stays "current".
 *
 *  Two jobs, deliberately the same number. The recording side restarts the count
 *  when the previous failure of the same kind is older than this, so a count
 *  means "this incident" and not "since the beginning of time". The owner console
 *  shows failures newer than this, so an incident that has been FIXED disappears
 *  on its own within a day instead of shouting forever about solved problems —
 *  an alarm nobody can silence is an alarm everybody learns to ignore. */
export const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Reasons longer than this are truncated. Long enough for a Postgres error to
 *  still name the column and the table it could not find, short enough that a
 *  novel-length driver dump cannot bloat the row — and, less obviously, short
 *  enough to stay far inside the btree limit on index entries. `reason` is half
 *  of a UNIQUE key, so an unbounded one could raise "index row size exceeds
 *  maximum", which would mean the alarm failing to record because the failure was
 *  wordy. */
export const MAX_REASON_LENGTH = 200;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_DIGITS_RE = /\d{5,}/g;

/** How far down `error.cause` to look. Deep enough for driver-wraps-driver, shallow
 *  enough that a self-referencing chain cannot spin. */
const MAX_CAUSE_DEPTH = 5;

/** A Postgres SQLSTATE: five characters, digits and capitals. */
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

function safeMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return String(value);
  } catch {
    // `throw Object.create(null)` is legal, and String() refuses to convert it.
    return '';
  }
}

/**
 * The most specific message in the `cause` chain, plus its SQLSTATE.
 *
 * THIS IS THE DIFFERENCE BETWEEN AN ALARM AND A DECORATION, and it was found by
 * running the thing rather than reading it. Drizzle does not rethrow the driver's
 * error — it wraps it, and the wrapper's message is the FULL SQL TEXT:
 * "Failed query: select "id", "name", "phone_number_id", …". Truncated to fit,
 * that is 200 characters of column list which never reaches the word that
 * matters. The Postgres sentence — `column church.courtesy_text does not exist`,
 * the entire content of the 2026-08-10 outage — is one level down in `cause`.
 *
 * The SQLSTATE comes along because Postgres LOCALISES its messages (lc_messages)
 * and the code never changes: 42703 is undefined_column in every locale and every
 * version, so the reading side can classify a failure without betting on English.
 */
function rootCause(error: unknown): { message: string; code: string | null } {
  let message = '';
  let code: string | null = null;
  let current: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current != null; depth += 1) {
    // Deeper is more specific, so a non-empty value at any level overwrites the
    // shallower one — but an EMPTY one never overwrites a useful parent.
    const found = safeMessage(current).trim();
    if (found) message = found;

    const candidate = (current as { code?: unknown }).code;
    if (typeof candidate === 'string' && SQLSTATE_RE.test(candidate)) code = candidate;

    const next: unknown = (current as { cause?: unknown }).cause;
    if (next === current) break;
    current = next;
  }

  return { message, code };
}

/**
 * The error, reduced to a short stable sentence.
 *
 * The redaction is not decoration; it is what makes the aggregation work and
 * what keeps this table clean.
 *
 * - AGGREGATION: the row key is (church_id, reason). Postgres puts the offending
 *   VALUE in a constraint-violation message, so an unredacted reason would be
 *   unique per message — a distinct row per inbound message, which is exactly the
 *   thousands-of-identical-rows flood this design exists to avoid. Redacted, a
 *   million failures of one kind stay one row with a big number on it.
 * - PRIVACY: a member's phone number is the value in the most likely constraint
 *   violation here (contact_church_phone_uq), and this table is CROSS-CHURCH and
 *   readable by the vendor. Member phone numbers must not accumulate in it as a
 *   side effect of an error message. Digit runs of 5+ cover a phone number and a
 *   wa_message_id; short numbers (a column count, an HTTP status) survive because
 *   they are diagnosis, not identity.
 */
export function toFailureReason(error: unknown): string {
  const { message, code } = rootCause(error);
  const cleaned = message
    // Multi-line driver errors would otherwise make the console unreadable and
    // the same failure look different depending on how the message wrapped.
    .replace(/\s+/g, ' ')
    .trim()
    .replace(UUID_RE, '<id>')
    .replace(LONG_DIGITS_RE, '<num>');

  // `throw undefined` and `throw new Error('')` are both legal and both used to
  // produce a NOT NULL violation on insert — i.e. the alarm failing to record
  // precisely because the failure was strange.
  if (!cleaned) return code ? `[${code}] Falha sem mensagem` : 'Falha sem mensagem';

  const reason = code ? `[${code}] ${cleaned}` : cleaned;
  return reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…` : reason;
}

/** Postgres's way of saying "the code and the database disagree about the
 *  schema": `column "courtesy_text" does not exist`, `column
 *  church.password_changed_at does not exist`, `relation "webhook_failure" does
 *  not exist`. Both incidents this week read exactly like this.
 *
 *  The gap is bounded but MUST allow a dot: the qualified form
 *  `column church.courtesy_text` is what the driver actually produced on
 *  2026-08-10, and an earlier `[^.]*` here matched the quoted form only — it
 *  would have stayed silent on the very message it was written for. */
const SCHEMA_DRIFT_RE = /\b(column|relation|type)\b.{0,80}?\bdoes not exist\b/i;

/** undefined_column, undefined_table, undefined_object. The three ways Postgres
 *  says "the code expects something this database does not have", which is what
 *  an unapplied migration IS. Checked before the sentence above because a
 *  SQLSTATE is stable and a message is not: Postgres translates its messages
 *  according to lc_messages, so the English regex is the fallback, not the rule. */
const SCHEMA_DRIFT_CODES = /^\[(42703|42P01|42704)\]/;

/** The one interpretation worth offering, in pt-BR, at READ time.
 *
 *  Deliberately not stored: the recorded row holds the fact (what Postgres said),
 *  never a guess about it. A guess that turns out to be wrong should be fixable
 *  by editing this function, not by rewriting history. */
export function schemaDriftHint(reason: string): string | null {
  return SCHEMA_DRIFT_CODES.test(reason) || SCHEMA_DRIFT_RE.test(reason)
    ? 'Isto tem cara de migração gerada e não aplicada: o código pede algo que não existe no banco. Rode as migrações pendentes.'
    : null;
}
