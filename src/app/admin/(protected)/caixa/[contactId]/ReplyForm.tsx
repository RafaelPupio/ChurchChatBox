'use client';

import { useActionState, useEffect, useRef } from 'react';
import { sendReplyToContact, type ReplyState } from '../actions';

const initial: ReplyState = {};

export function ReplyForm({ contactId, hoursRemaining }: { contactId: string; hoursRemaining: number }) {
  const action = sendReplyToContact.bind(null, contactId);
  const [state, formAction, pending] = useActionState(action, initial);
  const box = useRef<HTMLTextAreaElement>(null);
  const draftKey = `secretaria:rascunho:${contactId}`;

  /** The thread now polls every 15s, so a refresh WILL land while she is typing.
   *
   *  The textarea itself is safe, and deliberately left uncontrolled. Verified in
   *  react-dom's commit path rather than assumed: for a textarea with neither
   *  `value` nor `defaultValue`, `updateTextarea` writes only `element.defaultValue
   *  = ''`, and per the HTML dirty-value-flag rule that cannot change the current
   *  value of a field the user has already edited. `router.refresh()` patches the
   *  tree in place and never unmounts this form, so the typed text stays put.
   *  (Making it controlled would have been WORSE: React resets an uncontrolled
   *  form when a form action is dispatched, which is what clears the box after a
   *  send — a controlled value would leave the sent message sitting there.)
   *
   *  What a refresh CAN legitimately do is remove this form: the 24h window
   *  expiring, or another admin ending the handoff, both flip the branch in
   *  page.tsx that renders it. Before polling existed that only happened on a
   *  manual reload; now it can happen mid-sentence. So the draft is mirrored to
   *  sessionStorage and restored if the form comes back — she never loses words
   *  she has already written. */
  useEffect(() => {
    const el = box.current;
    // Never clobber something already typed — this runs after a re-mount, not
    // only on first paint.
    if (!el || el.value) return;
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) el.value = saved;
    } catch {
      // sessionStorage can throw (private mode, blocked storage). A convenience
      // is not worth breaking the reply box over.
    }
  }, [draftKey]);

  function rememberDraft(event: React.ChangeEvent<HTMLTextAreaElement>) {
    try {
      sessionStorage.setItem(draftKey, event.target.value);
    } catch {
      // Ignored — see above.
    }
  }

  function forgetDraft() {
    // Dropped as the send is dispatched. React clears the box once the action
    // runs, succeed or fail, so a kept draft would resurrect an already-sent
    // message the next time this thread is opened.
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // Ignored — see above.
    }
  }

  return (
    <form action={formAction} onSubmit={forgetDraft} className="card">
      <label htmlFor="body">Responder</label>
      <textarea id="body" name="body" ref={box} onChange={rememberDraft} required />
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint grow">⏱️ Janela de resposta: ~{hoursRemaining}h restantes</span>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
