import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { isEmailDeliveryConfigured } from '@/lib/email';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (isAuthenticated(session)) {
    redirect('/admin/conteudo');
  }
  // Server-side: the transport choice must never reach the browser as an env var.
  return <LoginForm canResetByEmail={isEmailDeliveryConfigured()} />;
}
