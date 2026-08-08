'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  draftEffect,
  draftKey,
  dropDraft,
  readDraft,
  sessionDraftStore,
  writeDraft,
  type ReplyPhase,
} from '@/lib/draft';
import { sendReplyToContact, type ReplyState } from '../actions';

const initial: ReplyState = {};

export function ReplyForm({ contactId, hoursRemaining }: { contactId: string; hoursRemaining: number }) {
  const action = sendReplyToContact.bind(null, contactId);
  const [state, formAction, pending] = useActionState(action, initial);
  const box = useRef<HTMLTextAreaElement>(null);
  const key = draftKey(contactId);
  /** Whether the box actually still holds her words after the last settled
   *  dispatch. The reassurance under an error is rendered from this and not from
   *  `state.error`, because the mirror genuinely can be unavailable —
   *  sessionStorage throws in Safari private mode — and telling her the text was
   *  kept when it was not is worse than saying nothing. */
  const [textKept, setTextKept] = useState(false);

  /** The thread polls while it is open, so a refresh WILL land while she is typing.
   *
   *  The textarea itself is safe, and deliberately left uncontrolled. Verified in
   *  react-dom's commit path rather than assumed: for a textarea with neither
   *  `value` nor `defaultValue`, `updateTextarea` writes only `element.defaultValue
   *  = ''`, and per the HTML dirty-value-flag rule that cannot change the current
   *  value of a field the user has already edited. `router.refresh()` patches the
   *  tree in place and never unmounts this form, so the typed text stays put.
   *
   *  What a refresh CAN legitimately do is remove this form: the 24h window
   *  expiring, or another admin ending the handoff, both flip the branch in
   *  page.tsx that renders it. So the draft is mirrored to sessionStorage and
   *  restored if the form comes back.
   *
   *  And a FAILED SEND does the same damage without unmounting anything, which is
   *  what the previous version of this file got wrong: it dropped the draft in
   *  `onSubmit`, at dispatch, while react-dom clears the textarea on every submit
   *  regardless of outcome. Error message, empty box, no copy anywhere. The whole
   *  decision now lives in draftEffect(), where it is unit-tested; the reasoning
   *  and the react-dom citations are in src/lib/draft.ts.
   *
   *  Keyed on `state`, not on `pending`: useActionState hands back a fresh object
   *  on every settled dispatch, so a second consecutive failure re-runs this and
   *  restores again. `pending` would fire too early to survive React's reset. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const store = sessionDraftStore();

    if (store) {
      const phase: ReplyPhase = state.sent ? 'sent' : state.error ? 'failed' : 'idle';
      const effect = draftEffect(phase, el.value, readDraft(store, key));

      if (effect.kind === 'restore') el.value = effect.text;
      else if (effect.kind === 'clear') {
        el.value = '';
        dropDraft(store, key);
      }
    }

    // Read back from the DOM rather than from the effect we intended: this is the
    // claim the message below makes, so it has to be the thing that is true.
    setTextKept(el.value !== '');
  }, [state, key]);

  function rememberDraft(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const store = sessionDraftStore();
    if (store) writeDraft(store, key, event.target.value);
  }

  return (
    <form action={formAction} className="card">
      <label htmlFor="body">Responder</label>
      <textarea id="body" name="body" ref={box} onChange={rememberDraft} required />
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint grow">⏱️ Janela de resposta: ~{hoursRemaining}h restantes</span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      {state.error && (
        <p className="error">
          {state.error}
          {textKept && <span className="hint"> Sua mensagem continua no campo acima.</span>}
        </p>
      )}
    </form>
  );
}
