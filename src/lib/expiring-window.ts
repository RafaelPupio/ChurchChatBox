/** How long before the purge a church is warned about expiring prayer requests.
 *
 *  30 days, chosen against the only channel this product has — the panel. There is
 *  no secretary email on file and this design refuses to add a notification
 *  channel, so a warning delivered by a passive channel has to survive the
 *  reader's absence:
 *
 *   - 7 days is defeated by one holiday. A courtesy nobody can receive is not one.
 *   - 90 days makes the banner permanent, and a banner that is always on stops
 *     being read within a month. The failure mode is not missing one warning, it
 *     is the church no longer seeing warnings at all.
 *   - 30 days clears one full monthly cycle with room for a two-week absence, and
 *     is short enough that the window is frequently EMPTY for a normal-volume
 *     church — so the banner appearing still means something.
 *
 *  The load-bearing assumption is that a secretary opens the panel at least
 *  monthly. Nobody has observed that; no church has used this product yet. If real
 *  usage is quarterly, this number is what changes — not the purge. */
export const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
