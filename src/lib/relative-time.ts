const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "há 5 minutos", in pt-BR. Pure: `now` is a parameter, never read from the clock.
 *
 * RELATIVE AND NOT A CLOCK TIME, on purpose. This renders on the server, and the
 * server is Vercel, which runs in UTC — a formatted "10:42" would be three hours
 * wrong for every human reading it in Brazil, and on an alarm that says how long
 * a church has been broken, being three hours wrong is the whole ballgame. A
 * relative distance is right in any timezone.
 *
 * Anything under a minute — and anything in the future, which is what a small
 * clock skew between Postgres's now() and the app's looks like — reads as "agora
 * mesmo" rather than "há -3 segundos".
 */
export function timeAgo(when: Date, now: Date): string {
  const elapsed = now.getTime() - when.getTime();
  if (elapsed < MINUTE_MS) return 'agora mesmo';

  // 'always', not 'auto'. 'auto' renders two days as "anteontem" — a claim about
  // the CALENDAR — when the value is a DURATION: 60 hours is also "anteontem" to
  // it, and on an alarm that says how long a church has been broken, the number
  // is the whole message.
  const format = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' });
  if (elapsed < HOUR_MS) return format.format(-Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return format.format(-Math.floor(elapsed / HOUR_MS), 'hour');
  return format.format(-Math.floor(elapsed / DAY_MS), 'day');
}
