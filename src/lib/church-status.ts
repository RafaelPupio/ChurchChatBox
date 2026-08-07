export type ChurchStatus = 'active' | 'past_due' | 'suspended';

/** A church whose payment failed keeps working for 7 days before the bot goes
 *  quiet, so members are never dropped into silence over an expired card. */
export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure. The status the app should actually act on, given the grace deadline.
 *  Computed on read rather than by a scheduled job — there is no cron to fail
 *  silently, and the same rule applies everywhere it is consulted.
 *
 *  A past_due church with no grace_until reads as past_due, NOT suspended:
 *  missing data must never take a church off the air. */
export function effectiveStatus(
  status: ChurchStatus,
  graceUntil: Date | null,
  now: Date,
): ChurchStatus {
  if (status !== 'past_due') return status;
  if (!graceUntil) return 'past_due';
  return now.getTime() >= graceUntil.getTime() ? 'suspended' : 'past_due';
}
