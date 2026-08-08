import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_UNUSABLE_MESSAGE } from '@/lib/auth/reset-messages';
import { ResetPasswordForm } from './ResetPasswordForm';

/** PUBLIC, and outside the (protected) route group for the same reason as
 *  esqueci-senha: the whole point is that the visitor cannot log in.
 *
 *  `referrer: no-referrer` is not decoration. The token is in the query string —
 *  unavoidable, a link is what arrives by email — and without this header the
 *  browser would put the full URL, token included, in the Referer of any request
 *  this page triggers. There is nothing external on the page today, so the header
 *  is closing the door before someone adds a logo from a CDN.
 *
 *  `noindex` keeps a token out of a search index if the page is ever crawled from
 *  a leaked link. */
export const metadata: Metadata = {
  title: 'Criar uma nova senha — Secretária Virtual',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  // `?token=a&token=b` arrives as an array; take nothing rather than guessing.
  const token = typeof params.token === 'string' ? params.token : '';

  // The token is NOT looked up here. Validating it on render would cost a database
  // round trip on every visit and would let anyone measure whether a given token
  // exists without ever submitting the form. It is checked once, at the moment it
  // is spent, inside the atomic UPDATE in the action.
  if (!token) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1 style={{ marginTop: 0 }}>Endereço incompleto</h1>
        <p className="error">{LINK_UNUSABLE_MESSAGE}</p>
        <p className="hint">
          Alguns aplicativos de e-mail cortam endereços longos. Se puder, copie o endereço
          inteiro da mensagem e cole na barra do navegador.
        </p>
        <Link className="btnlink primary" href="/admin/esqueci-senha" style={{ marginTop: 12, width: '100%' }}>
          Pedir um novo endereço
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
