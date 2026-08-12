/** How long a church keeps a member's data. One constant, one function, no I/O.
 *
 *  365 days rather than "12 calendar months": the drift is at most a day, and a
 *  fixed number is testable, has one place to change, and cannot disagree with
 *  itself across a leap year. The member-facing promise says "12 meses", which is
 *  what 365 days is in every sense a member cares about.
 *
 *  This number is a PRODUCT decision reflected in a promise the bot already makes
 *  — not a legal determination. Changing it changes the Privacidade text too. */
export const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/** Everything strictly older than this is purged. Pure: takes the clock as an
 *  argument so the purge can be driven from a fixture and so this file never
 *  becomes untestable. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_MS);
}
