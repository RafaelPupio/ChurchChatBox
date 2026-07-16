import { redirect } from 'next/navigation';
import { getSession, isAuthenticated } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (isAuthenticated(session)) {
    redirect('/admin/conteudo');
  }
  return <LoginForm />;
}
