import { describe, it, expect } from 'vitest';
import { THREAD_WINDOW, windowThread } from '@/lib/thread-window';

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
