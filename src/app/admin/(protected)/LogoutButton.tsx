'use client';

import { dropAllDrafts, sessionDraftStore } from '@/lib/draft';
import { logout } from './actions';

/** Sair, plus the client-side half of logging out.
 *
 *  `session.destroy()` clears the cookie, which is all the server can reach. The
 *  reply-draft mirror lives in sessionStorage on the device, so without this a
 *  half-written pastoral reply stays sitting there, readable by whoever signs in
 *  next — and the secretariat phone at the back of the church is shared by
 *  volunteers by design. Under LGPD that draft is sensitive personal data, so it
 *  does not get to outlive the session that wrote it.
 *
 *  Clearing in `onSubmit` — at dispatch, before the action has returned — is
 *  correct HERE, and is exactly what was wrong one component over in ReplyForm.
 *  The difference is which way the failure has to fall. A draft dropped before a
 *  send that then fails loses her words, so that one waits for success. A draft
 *  left behind because the logout request failed is readable by the next person,
 *  so this one goes first and takes the worst case of "she stays logged in with
 *  her draft cleared" — an annoyance, against a privacy leak. */
export function LogoutButton() {
  function clearLocalDrafts() {
    const store = sessionDraftStore();
    if (store) dropAllDrafts(store);
  }

  return (
    <form action={logout} onSubmit={clearLocalDrafts}>
      <button type="submit">Sair</button>
    </form>
  );
}
