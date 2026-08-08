/** The reply-draft mirror: what to do with a half-written reply, as pure
 *  functions over a Storage-shaped object.
 *
 *  This lives outside the component because the decision — and it is a decision,
 *  not a one-liner — is what the last implementation got wrong, and a decision
 *  that can be unit-tested should be.
 */

/** Namespace for everything this product parks in sessionStorage. `dropAllDrafts`
 *  keys off it, so anything added under this prefix is cleared at logout for
 *  free — and anything added OUTSIDE it silently is not. */
export const DRAFT_PREFIX = 'secretaria:rascunho:';

export function draftKey(contactId: string): string {
  return `${DRAFT_PREFIX}${contactId}`;
}

/** The slice of the Web Storage API this module touches. Declared structurally so
 *  every function below is testable in Node against a plain object, with no DOM
 *  and no jsdom. */
export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/** Where the reply box is in its send cycle.
 *
 *  `sending` is deliberately absent. React clears the textarea partway through a
 *  send and we cannot safely refill it before the send settles — see the comment
 *  on `draftEffect`. */
export type ReplyPhase = 'idle' | 'sent' | 'failed';

export type DraftEffect =
  /** Put this text back into the textarea. */
  | { kind: 'restore'; text: string }
  /** Empty the textarea and drop the stored draft: the words are on WhatsApp now. */
  | { kind: 'clear' }
  | { kind: 'none' };

/** THE rule, and the fix for the bug that made the mirror destroy what it existed
 *  to protect.
 *
 *  The old form dropped the draft in `onSubmit`, i.e. at dispatch. Verified in
 *  node_modules/react-dom (19.2.7) rather than assumed: `startHostTransition`
 *  wraps the action as `function () { requestFormReset(formFiber); return
 *  action(formData); }` — the reset is requested BEFORE the action runs and takes
 *  no account of what it returns, and `recursivelyResetForms` then calls
 *  `form.reset()` in the commit's mutation phase. So the textarea is emptied on a
 *  failed send exactly as on a successful one, and dropping the draft at dispatch
 *  meant a send that failed on weak signal left the error message sitting above
 *  an empty box with her 300 characters gone from everywhere.
 *
 *  So: forget the draft on SUCCESS, and put it back on failure.
 *
 *  Why there is no `sending` phase. The obvious improvement — keep the text
 *  visible while "Enviando…" shows — cannot be done this way. The pending flag is
 *  dispatched by `dispatchOptimisticSetState` at lane 2 (Sync), while the form
 *  reset is a transition-lane update, so `pending: true` commits FIRST and
 *  `form.reset()` lands in a later commit. Refilling the box on `pending` would
 *  write text that has not been wiped yet and then watch React wipe it, with no
 *  further dependency change to trigger a second restore. Keying the restore off
 *  the SETTLED state is safe by construction instead: that update is dispatched
 *  only after the action's promise resolves, which is strictly after the reset was
 *  queued on the same lane, so the reset can never land after it. The cost is
 *  honest and small — the box is empty for as long as the send is in flight.
 */
export function draftEffect(phase: ReplyPhase, boxValue: string, saved: string): DraftEffect {
  // The message left. Anything still stored would resurrect an already-sent
  // reply the next time this thread is opened.
  if (phase === 'sent') return { kind: 'clear' };

  // Never clobber what she is typing right now. This effect also runs on mount
  // and after every re-render of a still-mounted form, not only after a reset.
  if (boxValue !== '') return { kind: 'none' };

  if (saved === '') return { kind: 'none' };
  return { kind: 'restore', text: saved };
}

/** sessionStorage, or null where it is unavailable.
 *
 *  Reading `window.sessionStorage` THROWS outright in Safari private mode and
 *  wherever site data is blocked — it is not enough to guard the get/set calls.
 *  A convenience is never worth breaking the reply box over, so every caller
 *  treats null as "no mirror today" and carries on. */
export function sessionDraftStore(): DraftStore | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readDraft(store: DraftStore, key: string): string {
  try {
    return store.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(store: DraftStore, key: string, text: string): void {
  try {
    store.setItem(key, text);
  } catch {
    // Quota exceeded, or storage blocked mid-session. Ignored.
  }
}

export function dropDraft(store: DraftStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Ignored — see above.
  }
}

/** Every draft this product holds, dropped.
 *
 *  For logout on a shared secretariat phone: without this, a half-written
 *  pastoral reply stays readable to whoever signs in next. Under LGPD that text
 *  is sensitive personal data (Art. 5 II — religious matters, health, family
 *  circumstances are what people ask a church for help with), so it does not get
 *  to outlive the session that wrote it.
 *
 *  Collects the keys before removing any of them: removing during iteration
 *  reindexes the store and skips entries. */
export function dropAllDrafts(store: DraftStore): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && key.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    // Ignored — see above.
  }
}
