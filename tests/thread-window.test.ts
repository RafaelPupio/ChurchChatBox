import { describe, it, expect } from 'vitest';
import {
  THREAD_WINDOW,
  THREAD_WINDOW_MAX,
  requestedThreadWindow,
  windowThread,
} from '@/lib/thread-window';

/** The repo queries `limit + 1` rows newest-first; these are those rows. */
function newestFirst(n: number): number[] {
  // n, n-1, … 1 — as if message n were the most recent.
  return [...Array(n)].map((_, i) => n - i);
}

describe('windowThread', () => {
  it('returns the thread oldest-first for rendering', () => {
    expect(windowThread(newestFirst(3), 10).messages).toEqual([1, 2, 3]);
  });

  it('reports a short thread as complete', () => {
    const { messages, truncated } = windowThread(newestFirst(5), 10);
    expect(messages).toHaveLength(5);
    expect(truncated).toBe(false);
  });

  it('a thread of exactly the window is NOT truncated', () => {
    // The query asks for limit + 1, so exactly `limit` rows back means there is
    // nothing older. Off by one here and the panel tells every church with a
    // 200-message thread that it is hiding history it is not hiding.
    const { messages, truncated } = windowThread(newestFirst(10), 10);
    expect(messages).toHaveLength(10);
    expect(truncated).toBe(false);
  });

  it('one row past the window means truncated, and the extra row is dropped', () => {
    const { messages, truncated } = windowThread(newestFirst(11), 10);
    expect(truncated).toBe(true);
    expect(messages).toHaveLength(10);
    // The NEWEST ten, not the oldest ten: 2…11, with 1 left behind.
    expect(messages).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('keeps the newest messages from a long thread', () => {
    const { messages, truncated } = windowThread(newestFirst(400), THREAD_WINDOW);
    expect(truncated).toBe(true);
    expect(messages).toHaveLength(THREAD_WINDOW);
    expect(messages[messages.length - 1]).toBe(400);
    expect(messages[0]).toBe(400 - THREAD_WINDOW + 1);
  });

  it('handles an empty thread', () => {
    expect(windowThread([], 10)).toEqual({ messages: [], truncated: false });
  });

  it('does not mutate the rows it was given', () => {
    // .reverse() is in-place; returning the query result reversed under the
    // caller would be a nasty aliasing bug.
    const rows = newestFirst(4);
    const copy = [...rows];
    windowThread(rows, 10);
    expect(rows).toEqual(copy);
  });

  it('clamps a nonsense limit instead of claiming a one-message thread is truncated', () => {
    expect(windowThread(newestFirst(1), 0)).toEqual({ messages: [1], truncated: false });
    expect(windowThread(newestFirst(1), -5)).toEqual({ messages: [1], truncated: false });
  });

  it('the window is a bounded, sane size', () => {
    expect(THREAD_WINDOW).toBeGreaterThanOrEqual(50);
    expect(THREAD_WINDOW).toBeLessThanOrEqual(500);
  });
});

/** The window she can widen by tapping "carregar mensagens anteriores".
 *
 *  This is the whole of MEDIUM 3: before it, a bounded thread had no pagination
 *  and no control, so the beginning of a long pastoral conversation was not
 *  merely unloaded — it was unreachable from the panel forever. */
describe('requestedThreadWindow', () => {
  it('defaults to the plain window when the param is absent', () => {
    const view = requestedThreadWindow(undefined);
    expect(view.limit).toBe(THREAD_WINDOW);
    expect(view.expanded).toBe(false);
    expect(view.nextStep).toBe(1);
  });

  it('one step is one more window of history, not one more message', () => {
    expect(requestedThreadWindow('1').limit).toBe(THREAD_WINDOW * 2);
    expect(requestedThreadWindow('2').limit).toBe(THREAD_WINDOW * 3);
  });

  it('marks a widened window as expanded, and the default one as not', () => {
    expect(requestedThreadWindow('0').expanded).toBe(false);
    expect(requestedThreadWindow('1').expanded).toBe(true);
    // `expanded` drives BOTH the slower poll cadence and the scroll anchor's
    // refusal to land on the newest message, so getting step 0 wrong would
    // quietly slow the poll on every ordinary thread.
  });

  it('hands the link the NEXT step, so each tap goes one window further back', () => {
    expect(requestedThreadWindow(undefined).nextStep).toBe(1);
    expect(requestedThreadWindow('1').nextStep).toBe(2);
    expect(requestedThreadWindow('3').nextStep).toBe(4);
  });

  it('clamps a hostile URL to the ceiling instead of selecting the whole table', () => {
    // This number reaches a SQL LIMIT. `?anteriores=99999999` must not become a
    // request for every message a church ever exchanged with a person.
    expect(requestedThreadWindow('99999999').limit).toBe(THREAD_WINDOW_MAX);
    expect(requestedThreadWindow(String(Number.MAX_SAFE_INTEGER)).limit).toBe(THREAD_WINDOW_MAX);
  });

  it('offers no further step once the ceiling is reached', () => {
    // A "carregar mensagens anteriores" link that cannot load anything more is a
    // control that lies. At the ceiling the page says so in words instead.
    const atCeiling = requestedThreadWindow(String(THREAD_WINDOW_MAX / THREAD_WINDOW - 1));
    expect(atCeiling.limit).toBe(THREAD_WINDOW_MAX);
    expect(atCeiling.nextStep).toBeNull();
    expect(requestedThreadWindow('99999999').nextStep).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['abc', 'not a number'],
    ['-1', 'negative'],
    ['3.5', 'fractional'],
    [' 2', 'padded'],
    ['1e3', 'exponent notation'],
    ['0x10', 'hex'],
    ['Infinity', 'infinite'],
    ['NaN', 'NaN'],
  ])('reads %s (%s) as the default window rather than failing', (raw) => {
    // A mangled URL should show her the normal thread, not an error page and not
    // a NaN LIMIT.
    const view = requestedThreadWindow(raw);
    expect(view.limit).toBe(THREAD_WINDOW);
    expect(view.expanded).toBe(false);
  });

  it('takes the first value when the param is repeated in the URL', () => {
    expect(requestedThreadWindow(['2', '9']).limit).toBe(THREAD_WINDOW * 3);
    expect(requestedThreadWindow([]).limit).toBe(THREAD_WINDOW);
  });

  it('the ceiling is a whole number of steps above the default', () => {
    // Otherwise the last tap lands on a partial window and nextStep's
    // `limit >= MAX` test would be reached by a step that shows fewer new
    // messages than every step before it.
    expect(THREAD_WINDOW_MAX).toBeGreaterThan(THREAD_WINDOW);
    expect(THREAD_WINDOW_MAX % THREAD_WINDOW).toBe(0);
  });

  it('every step actually widens the query the repo will run', () => {
    // Walk the ladder the way the UI does — follow nextStep until it runs out —
    // and assert it terminates and is strictly increasing. A bug that returned
    // the same nextStep forever would render a link that reloads the same page.
    const seen: number[] = [];
    let step: number | null = 0;
    while (step !== null) {
      const view = requestedThreadWindow(String(step));
      seen.push(view.limit);
      step = view.nextStep;
      expect(seen.length).toBeLessThan(50); // no infinite ladder
    }
    expect(seen[0]).toBe(THREAD_WINDOW);
    expect(seen[seen.length - 1]).toBe(THREAD_WINDOW_MAX);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('feeds windowThread a limit it can honour', () => {
    // End to end with the other half: 250 real messages, default window, then one
    // tap — she gets the whole thread and the notice goes away.
    const rows = newestFirst(250);
    const first = windowThread(rows.slice(0, requestedThreadWindow(undefined).limit + 1), THREAD_WINDOW);
    expect(first.truncated).toBe(true);
    expect(first.messages).toHaveLength(THREAD_WINDOW);

    const wider = requestedThreadWindow('1');
    const second = windowThread(rows.slice(0, wider.limit + 1), wider.limit);
    expect(second.truncated).toBe(false);
    expect(second.messages).toHaveLength(250);
  });
});
