import type { Metadata } from 'next';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/** PUBLIC, and outside the (protected) route group on purpose — someone who has
 *  forgotten their password cannot be asked to prove who they are first. The
 *  privilege-boundary test requires every page.tsx under admin/(protected) to
 *  import requireReadableSession, which is exactly why this page does not live
 *  there.
 *
 *  The URL carries no church identifier and the page renders nothing that varies
 *  by church, so it cannot be used to ask whether a given church exists. The only
 *  input is an email address, and the answer to that question is handled in
 *  actions.ts, which gives the same reply either way. */
export const metadata: Metadata = {
  title: 'Esqueci minha senha — Secretária Virtual',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
