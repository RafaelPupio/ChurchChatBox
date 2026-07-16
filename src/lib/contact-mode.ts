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
