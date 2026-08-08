import { describe, it, expect } from 'vitest';
import {
  DRAFT_PREFIX,
  draftEffect,
  draftKey,
  dropAllDrafts,
  dropDraft,
  readDraft,
  writeDraft,
  type DraftStore,
} from '@/lib/draft';

/** A sessionStorage stand-in. `throwing` reproduces Safari private mode, where
 *  every Storage call raises instead of returning. */
function fakeStore(initial: Record<string, string> = {}, throwing = false): DraftStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    data,
    get length() {
      if (throwing) boom();
      return data.size;
    },
    key(i) {
      if (throwing) boom();
      return [...data.keys()][i] ?? null;
    },
    getItem(k) {
      if (throwing) boom();
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      if (throwing) boom();
      data.set(k, v);
    },
    removeItem(k) {
      if (throwing) boom();
      data.delete(k);
    },
  };
}

describe('draftEffect — what happens to a half-written reply', () => {
  const TYPED = 'Paz do Senhor, irmã. Sobre o pedido de oração da sua mãe…';

  it('a FAILED send puts the words back in the empty box', () => {
    // The bug this whole module exists for: react-dom empties the textarea on
    // every dispatch, so after a failure the box is blank and the draft is the
    // only surviving copy.
    expect(draftEffect('failed', '', TYPED)).toEqual({ kind: 'restore', text: TYPED });
  });

  it('a SUCCESSFUL send clears the box and drops the draft', () => {
    // Keeping it would resurrect an already-sent message next time she opens
    // this thread.
    expect(draftEffect('sent', '', TYPED)).toEqual({ kind: 'clear' });
  });

  it('clears on success even when the box somehow still holds text', () => {
    expect(draftEffect('sent', TYPED, TYPED)).toEqual({ kind: 'clear' });
  });

  it('restores on a remount with an empty box (the form came back)', () => {
    expect(draftEffect('idle', '', TYPED)).toEqual({ kind: 'restore', text: TYPED });
  });

  it('never clobbers what she is typing right now', () => {
    // This effect re-runs on re-renders of a still-mounted form, not only after
    // a reset — overwriting live typing with a stale mirror would be its own bug.
    expect(draftEffect('idle', 'texto novo', TYPED)).toEqual({ kind: 'none' });
    expect(draftEffect('failed', 'texto novo', TYPED)).toEqual({ kind: 'none' });
  });

  it('does nothing when there is no draft to restore', () => {
    expect(draftEffect('idle', '', '')).toEqual({ kind: 'none' });
    expect(draftEffect('failed', '', '')).toEqual({ kind: 'none' });
  });

  it('survives repeated failures — the draft is still there for the next retry', () => {
    // Nothing removes the draft on failure, so a second and third attempt on bad
    // signal each recover the same text.
    let effect = draftEffect('failed', '', TYPED);
    expect(effect).toEqual({ kind: 'restore', text: TYPED });
    effect = draftEffect('failed', '', TYPED);
    expect(effect).toEqual({ kind: 'restore', text: TYPED });
  });
});

describe('draft storage', () => {
  it('namespaces the key by contact', () => {
    expect(draftKey('abc')).toBe(`${DRAFT_PREFIX}abc`);
    expect(draftKey('abc')).not.toBe(draftKey('abd'));
  });

  it('round-trips a draft', () => {
    const store = fakeStore();
    writeDraft(store, draftKey('c1'), 'oi');
    expect(readDraft(store, draftKey('c1'))).toBe('oi');
    dropDraft(store, draftKey('c1'));
    expect(readDraft(store, draftKey('c1'))).toBe('');
  });

  it('reads a missing key as empty, not null', () => {
    expect(readDraft(fakeStore(), 'nada')).toBe('');
  });

  it('swallows a storage that throws on every call', () => {
    // Private mode must not break the reply box.
    const store = fakeStore({}, true);
    expect(() => writeDraft(store, 'k', 'v')).not.toThrow();
    expect(() => dropDraft(store, 'k')).not.toThrow();
    expect(() => dropAllDrafts(store)).not.toThrow();
    expect(readDraft(store, 'k')).toBe('');
  });
});

describe('dropAllDrafts — logout on a shared phone', () => {
  it('removes every draft', () => {
    const store = fakeStore({
      [draftKey('c1')]: 'pedido de oração da Dona Maria',
      [draftKey('c2')]: 'resposta ao Pastor',
    });
    dropAllDrafts(store);
    expect(store.data.size).toBe(0);
  });

  it('leaves keys outside the namespace alone', () => {
    const store = fakeStore({
      [draftKey('c1')]: 'rascunho',
      'outra-coisa': 'preservar',
    });
    dropAllDrafts(store);
    expect([...store.data.keys()]).toEqual(['outra-coisa']);
  });

  it('does not skip entries — removal must not reindex mid-iteration', () => {
    // Removing while walking store.key(i) shifts the remaining indices and would
    // leave every second draft behind, which is the whole leak this prevents.
    const store = fakeStore(
      Object.fromEntries([...Array(10)].map((_, i) => [draftKey(`c${i}`), `rascunho ${i}`])),
    );
    dropAllDrafts(store);
    expect(store.data.size).toBe(0);
  });
});
