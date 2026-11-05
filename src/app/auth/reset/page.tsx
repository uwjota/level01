import { AuthForm } from '@/components/auth-form';
import { configured, serverClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
export default async function Reset() {
  if (!configured()) redirect('/login');
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2')
    redirect('/auth/mfa?next=/auth/reset');
  return <AuthForm configured reset />;
}

export const dynamic = 'force-dynamic';
