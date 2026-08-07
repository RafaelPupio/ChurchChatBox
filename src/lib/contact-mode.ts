import type { ContactMode } from './types';

/** Staff have 24h to pick up a handoff. After that the bot resumes, so a member
 *  is never stranded in silence when nobody answers. The panel will refresh
 *  modeChangedAt on each staff reply, sliding this window. */
export const HUMAN_MODE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Pure. Computes the mode the router should actually see, given how long the
 *  contact has been sitting in `human` mode. The router itself stays unaware of
 *  wall-clock time — this is the only place staleness is evaluated, and it takes
 *  `now` as a parameter so callers (and tests) control time explicitly. */
export function effectiveMode(mode: ContactMode, modeChangedAt: Date, now: Date): ContactMode {
  if (mode !== 'human') return mode;
  return now.getTime() - modeChangedAt.getTime() >= HUMAN_MODE_TIMEOUT_MS ? 'bot' : 'human';
}

/** Which mode may be persisted for a turn whose replies were NOT delivered —
 *  because the church is suspended, or because the send threw.
 *
 *  The governing rule: a mode transition may be persisted *before* delivery only
 *  if it is a fact about what the MEMBER did. A transition into a mode that only
 *  makes sense because the member RECEIVED something waits for a successful send.
 *
 *  Pure, and exhaustive on purpose — there is no `default`, so adding a fourth
 *  ContactMode fails to compile here instead of being silently misclassified.
 *
 *  - `bot`: the router says the member's turn is closed. That is a fact about what
 *    they wrote, not about what we delivered. Always safe to persist.
 *  - `awaiting_prayer`: we would be arming a capture for a prompt that never
 *    arrived, so the next thing they say — possibly "oi" — would be filed as their
 *    prayer request. Leave the stored mode alone.
 *  - `human`: the handoff message never arrived, and while a church is suspended
 *    the panel is read-only, so no staff member can pick it up. Leave the stored
 *    mode alone — EXCEPT when the member was already in `awaiting_prayer`, because
 *    leaving them armed is the same harm as above. */
export function modeAfterUndeliveredTurn(mode: ContactMode, nextMode: ContactMode): ContactMode {
  switch (nextMode) {
    case 'bot':
      return 'bot';
    case 'awaiting_prayer':
      return mode === 'awaiting_prayer' ? 'awaiting_prayer' : mode;
    case 'human':
      return mode === 'awaiting_prayer' ? 'bot' : mode;
  }
}
