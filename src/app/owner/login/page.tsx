import { redirect } from 'next/navigation';
import { getOwnerSession, isOwnerAuthenticated } from '@/lib/auth/owner-session';
import { OwnerLoginForm } from './OwnerLoginForm';

export default async function OwnerLoginPage() {
  const session = await getOwnerSession();
  if (isOwnerAuthenticated(session)) {
    redirect('/owner');
  }
  return <OwnerLoginForm />;
}
