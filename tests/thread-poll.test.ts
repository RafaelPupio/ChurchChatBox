import { describe, it, expect } from 'vitest';
import {
  THREAD_POLL_FAST_MS,
  THREAD_POLL_SLOW_MS,
  threadPollMs,
} from '@/lib/thread-poll';
import type { ContactMode } from '@/lib/types';

const MODES: ContactMode[] = ['bot', 'awaiting_prayer', 'human'];

describe('threadPollMs', () => {
  it('polls fast for an open handoff at the default window', () => {
    expect(threadPollMs({ mode: 'human', suspended: false, expanded: false })).toBe(
      THREAD_POLL_FAST_MS,
    );
  });

  it.each(MODES)('never stops polling — mode %s always gets an interval', (mode) => {
    // THE REGRESSION THIS FILE EXISTS FOR. Polling used to be switched OFF for a
    // bot-mode contact. The inbox list does not poll either, so the promised
    // fallback ("the handoff shows up next time the inbox is opened") meant
    // manual navigation — and a bot-mode thread is exactly where "quero falar com
    // um atendente" arrives. The single highest-value event in the product became
    // the one case the panel stopped showing, with nothing on screen to hint that
    // the page had gone stale.
    for (const suspended of [true, false]) {
      for (const expanded of [true, false]) {
        const ms = threadPollMs({ mode, suspended, expanded });
        expect(ms).toBeGreaterThan(0);
        expect(Number.isFinite(ms)).toBe(true);
      }
    }
  });

  it.each(['bot', 'awaiting_prayer'] as ContactMode[])(
    'watches a %s thread for the escalation, just more slowly',
    (mode) => {
      expect(threadPollMs({ mode, suspended: false, expanded: false })).toBe(THREAD_POLL_SLOW_MS);
    },
  );

  it('keeps polling a suspended church, slowly', () => {
    // Decided deliberately, and contrary to the gate this replaced. That gate
    // claimed "its bot is switched off, so no new message is coming at all" —
    // which is false in this codebase: the webhook's suspension gate sits BELOW
    // routing, so a suspended church still records every inbound message and
    // still persists mode transitions. Members can still write in and can still
    // be flipped to `human`. She cannot reply, and the layout banner says the
    // panel is read-only — but read-only is not the same promise as frozen.
    expect(threadPollMs({ mode: 'human', suspended: true, expanded: false })).toBe(
      THREAD_POLL_SLOW_MS,
    );
    expect(threadPollMs({ mode: 'bot', suspended: true, expanded: false })).toBe(
      THREAD_POLL_SLOW_MS,
    );
  });

  it('slows down while a widened window is on screen', () => {
    // 1000 messages re-serialised every 15 seconds would re-create the payload
    // bug the thread bound was written to kill — over her mobile data, at five
    // times the size of the thread that caused it.
    expect(threadPollMs({ mode: 'human', suspended: false, expanded: true })).toBe(
      THREAD_POLL_SLOW_MS,
    );
  });

  it('is a real slowdown, not a rename of the same number', () => {
    expect(THREAD_POLL_SLOW_MS).toBeGreaterThan(THREAD_POLL_FAST_MS);
  });

  it('keeps the slow cadence inside the span where a person would give up and reload', () => {
    // Polling exists to stop her reaching for the reload button. A cadence she
    // can out-wait is a cadence that has failed at its only job.
    expect(THREAD_POLL_SLOW_MS).toBeLessThanOrEqual(90_000);
    // And it must actually cost less than the fast one, or the gate bought
    // nothing: 4 queries a minute against 16.
    expect(THREAD_POLL_SLOW_MS / THREAD_POLL_FAST_MS).toBeGreaterThanOrEqual(3);
  });

  it('is pure — the same input gives the same answer', () => {
    const input = { mode: 'human' as ContactMode, suspended: false, expanded: false };
    expect(threadPollMs(input)).toBe(threadPollMs(input));
  });
});
