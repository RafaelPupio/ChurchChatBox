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
import { useOnline } from '@/lib/hooks/use-online';
import { sendReplyToContact, type ReplyState } from '../actions';

const initial: ReplyState = {};

export function ReplyForm({ contactId, hoursRemaining }: { contactId: string; hoursRemaining: number }) {
  const action = sendReplyToContact.bind(null, contactId);
  const [state, formAction, pending] = useActionState(action, initial);
  const box = useRef<HTMLTextAreaElement>(null);
  /** Needed only by the Enter-to-send handler below: a keydown has no form to
   *  submit until something hands it one. */
  const form = useRef<HTMLFormElement>(null);
  const key = draftKey(contactId);
  /** Whether the box actually still holds her words after the last settled
   *  dispatch. The reassurance under an error is rendered from this and not from
   *  `state.error`, because the mirror genuinely can be unavailable —
   *  sessionStorage throws in Safari private mode — and telling her the text was
   *  kept when it was not is worse than saying nothing. */
  const [textKept, setTextKept] = useState(false);
  /** With no network the send cannot succeed, so the button refuses instead of
   *  failing — a refusal she can act on beats an error she has to interpret. */
  const online = useOnline();

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
    /* A composer, not a form at the foot of the page. It sticks to the bottom of
       the viewport — above the tab bar, and above the software keyboard via
       --kb — because the reply box used to sit below the entire history, roughly
       1800px down a 30-message thread. */
    <form ref={form} action={formAction} className="card composer">
      {/* Above the box, so an error is not hidden under the keyboard she is
          typing on when it arrives. */}
      {state.error && (
        <p className="error">
          {state.error}
          {textKept && <span className="hint"> Sua mensagem continua no campo acima.</span>}
        </p>
      )}
      {/* The visible "Responder" label cost a line of an already short screen and
          said nothing the placeholder does not. Kept for screen readers, which
          have no placeholder to fall back on. */}
      <label htmlFor="body" className="sr-only">Responder</label>
      <div className="composer-row">
        <textarea
          id="body"
          name="body"
          className="composer-input"
          rows={2}
          ref={box}
          onChange={rememberDraft}
          required
          placeholder="Escreva sua resposta…"
          /* enterKeyHint relabels the phone keyboard's return key as "enviar"; the
             handler below is what makes it actually send, since a textarea would
             otherwise just insert a newline. Same behaviour as WhatsApp Web, which
             is the thing she already knows how to use. */
          enterKeyHint="send"
          autoComplete="off"
          onKeyDown={(event) => {
            // isComposing guards IME and predictive input: on an Android keyboard
            // mid-suggestion, Enter commits the word being typed and must not fire
            // off a half-written pastoral reply.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              // Guarded as well as the button: Enter is the fast path she will
              // actually use, and firing a doomed send would clear the textarea
              // through react-dom's form reset for nothing.
              if (!online) return;
              // requestSubmit, not submit(): submit() bypasses both the `required`
              // check and the React action, so it would send an empty body.
              form.current?.requestSubmit();
            }
          }}
        />
        <button
          className="primary composer-send"
          type="submit"
          disabled={pending || !online}
          aria-label={online ? 'Enviar resposta' : 'Enviar resposta — sem conexão no momento'}
        >
          {pending ? '…' : '➤'}
        </button>
      </div>
      {/* The offline line promises no outbox, because there is none. It says what
          is visibly true — the words are still on screen — and gives the one
          instruction that actually protects them: leave the panel open. The draft
          is mirrored to sessionStorage, which survives a reload but not a
          relaunched standalone app, and is unavailable outright in Safari private
          mode, so "keep it open" is the only advice that is true everywhere. */}
      <p className="hint composer-hint">
        {online
          ? `⏱️ Janela de resposta: ~${hoursRemaining}h restantes · Enter envia, Shift+Enter quebra a linha`
          : '📵 Sem conexão — o texto continua aqui na tela. Deixe o painel aberto e toque em ➤ quando a internet voltar.'}
      </p>
    </form>
  );
}
